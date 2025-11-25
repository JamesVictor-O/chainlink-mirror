// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "../interfaces/AbstractReactive.sol";
import "../interfaces/ISystemContract.sol";
import "../interfaces/IReactive.sol";
import "../events/IChainlinkFeedReactorEvents.sol";

contract ChainlinkFeedReactor is AbstractReactive, IReactive, IChainlinkFeedReactorEvents {
    
    // ============ Constants ============
    
    // Chainlink's AnswerUpdated event signature
    // event AnswerUpdated(int256 indexed current, uint256 indexed roundId, uint256 updatedAt)
    bytes32 constant ANSWER_UPDATED_TOPIC_0 = 
        0x0559884fd3a460db3073b7fc896cc77986f16e378210ded43186175bf646fc5f;
    
    uint256 constant BASIS_POINTS = 10000;
    uint256 constant DEFAULT_DEVIATION = 50; // 0.5%
    uint256 constant DEFAULT_HEARTBEAT = 1 hours;
    
    // ============ State ============
    
    struct FeedConfig {
        uint64 originChainId;
        address feedAddress;
        uint64 destinationChainId;
        address destinationProxy;
        uint8 decimals;
        string description;
        uint256 deviationThreshold; // Basis points (50 = 0.5%)
        uint256 heartbeat;          // Seconds
        int256 lastSentPrice;
        uint256 lastSentTime;
        uint80 lastProcessedRoundId; // Track last processed round for polling
        bool active;
    }
    
    struct FeedMetrics {
        uint256 totalEventsReceived;
        uint256 updatesForwarded;
        uint256 updatesSkipped;
        uint256 deviationTriggered;
        uint256 heartbeatTriggered;
        uint256 estimatedGasSaved;
    }
    
    // feedId => config
    mapping(bytes32 => FeedConfig) public feeds;
    // feedId => metrics
    mapping(bytes32 => FeedMetrics) public metrics;
    // List of all feed IDs
    bytes32[] public feedIds;
    
    // Access control
    address public owner;
    
    // Reactive Network system contract (required)
    ISystemContract public immutable service;
    
    // ============ Modifiers ============
    
    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }
    
    // ============ Constructor ============
    
    /**
     * @notice Constructor for ChainlinkFeedReactor
     * @param _service Address of Reactive Network's system contract (required)
     * @dev System contract address must be provided for subscriptions to work
     */
    constructor(address _service) payable {
        require(_service != address(0), "System contract address required");
        service = ISystemContract(payable(_service));
        owner = msg.sender;
    }
    
    // ============ Feed Management ============
    
    /**
     * @notice Register a Chainlink feed to monitor and mirror
     * @param originChainId Chain ID where Chainlink feed exists (e.g., 11155111 for Sepolia)
     * @param feedAddress Address of Chainlink aggregator contract
     * @param destinationChainId Chain ID where feed should be mirrored
     * @param destinationProxy Address of FeedProxy contract on destination
     * @param decimals Feed decimals (usually 8)
     * @param description Feed description (e.g., "ETH/USD")
     * @param deviationThreshold Minimum price deviation to trigger update (basis points)
     * @param heartbeat Maximum time between updates (seconds)
     */
    function registerFeed(
        uint64 originChainId,
        address feedAddress,
        uint64 destinationChainId,
        address destinationProxy,
        uint8 decimals,
        string calldata description,
        uint256 deviationThreshold,
        uint256 heartbeat
    ) external onlyOwner returns (bytes32) {
        require(feedAddress != address(0), "Invalid feed address");
        require(destinationProxy != address(0), "Invalid proxy address");
        require(deviationThreshold > 0 && deviationThreshold <= BASIS_POINTS, "Invalid deviation");
        require(heartbeat >= 1 minutes, "Heartbeat too short");
        
        // Generate unique feed ID
        bytes32 feedId = keccak256(abi.encodePacked(originChainId, feedAddress));
        require(feeds[feedId].feedAddress == address(0), "Feed already registered");
        
        // Store configuration
        feeds[feedId] = FeedConfig({
            originChainId: originChainId,
            feedAddress: feedAddress,
            destinationChainId: destinationChainId,
            destinationProxy: destinationProxy,
            decimals: decimals,
            description: description,
            deviationThreshold: deviationThreshold,
            heartbeat: heartbeat,
            lastSentPrice: 0,
            lastSentTime: 0,
            lastProcessedRoundId: 0,
            active: true
        });
        
        feedIds.push(feedId);
        
        // Subscribe to Chainlink's AnswerUpdated events through Reactive Network's system contract
        // This is the MAGIC - Reactive Network will now automatically
        // call react() whenever this event fires!
        service.subscribe(
            uint256(originChainId),              // Which chain to monitor
            feedAddress,                         // Which contract to monitor
            uint256(ANSWER_UPDATED_TOPIC_0),     // Which event to monitor (AnswerUpdated)
            REACTIVE_IGNORE,                     // topic1 (current price - we read from data)
            REACTIVE_IGNORE,                     // topic2 (roundId - we read from data)
            REACTIVE_IGNORE                      // topic3 (not used)
        );
        
        emit FeedRegistered(
            feedId,
            originChainId,
            feedAddress,
            destinationChainId,
            destinationProxy
        );
        
        return feedId;
    }
    
    /**
     * @notice Register feed with default settings
     */
    function registerFeedDefault(
        uint64 originChainId,
        address feedAddress,
        uint64 destinationChainId,
        address destinationProxy,
        uint8 decimals,
        string calldata description
    ) external onlyOwner returns (bytes32) {
        return this.registerFeed(
            originChainId,
            feedAddress,
            destinationChainId,
            destinationProxy,
            decimals,
            description,
            DEFAULT_DEVIATION,
            DEFAULT_HEARTBEAT
        );
    }
    
    // ============ Reactive Logic (Core Functionality) ============
    
    function pollFeed(
        bytes32 feedId,
        uint80 roundId,
        int256 answer,
        uint256 updatedAt,
        uint80 answeredInRound
    ) external reactorOnly {
        FeedConfig storage config = feeds[feedId];
        FeedMetrics storage m = metrics[feedId];
        
        // Validate feed exists and is active
        require(config.active && config.feedAddress != address(0), "Feed not active");
        
        // Check if this is a new round (compare roundId to avoid processing same round twice)
        if (roundId <= config.lastProcessedRoundId) {
            // Already processed this round or older round
            return;
        }
        
        // Update last processed round ID
        config.lastProcessedRoundId = roundId;
        
        // Update metrics (treat as event received)
        m.totalEventsReceived++;
        
        // Validate price data
        if (answer <= 0) {
            emit UpdateSkipped(feedId, roundId, answer, SkipReason.InvalidData);
            m.updatesSkipped++;
            return;
        }
        
        // Determine if we should forward this update
        (bool shouldForward, UpdateReason reason) = _shouldForward(
            config,
            answer,
            updatedAt
        );
        
        if (!shouldForward) {
            emit UpdateSkipped(
                feedId, 
                roundId, 
                answer,
                _getSkipReason(config, answer, updatedAt)
            );
            m.updatesSkipped++;
            m.estimatedGasSaved += 200000; // Estimated gas saved per skip
            return;
        }
        
        // Forward update to destination chain
        _forwardUpdate(
            config,
            feedId,
            roundId,
            answer,
            updatedAt,
            reason
        );
        
        // Update state
        config.lastSentPrice = answer;
        config.lastSentTime = block.timestamp;
        
        // Update metrics
        m.updatesForwarded++;
        if (reason == UpdateReason.DeviationThreshold) {
            m.deviationTriggered++;
        } else if (reason == UpdateReason.HeartbeatExpired) {
            m.heartbeatTriggered++;
        }
    }
    
    /**
     * @notice Called AUTOMATICALLY by Reactive Network system contract when subscribed event fires
     * @dev This is the heart of the reactive paradigm - no manual triggering needed!
     * @dev The system contract on Reactive Network calls this, not the VM instance
     * @dev Matches IReactive interface signature
     * @param log LogRecord containing event information from Reactive Network
     */
    function react(IReactive.LogRecord calldata log) external reactorOnly override {
        // Extract event parameters from LogRecord
        int256 currentPrice = int256(log.topic_1);
        uint80 roundId = uint80(log.topic_2);
        uint256 updatedAt = abi.decode(log.data, (uint256));
        
        // Identify which feed this event is for
        bytes32 feedId = keccak256(abi.encodePacked(uint64(log.chain_id), log._contract));
        FeedConfig storage config = feeds[feedId];
        FeedMetrics storage m = metrics[feedId];
        
        // Validate feed exists and is active
        if (!config.active || config.feedAddress == address(0)) {
            return;
        }
        
        // Update metrics
        m.totalEventsReceived++;
        
        // Validate price data
        if (currentPrice <= 0) {
            emit UpdateSkipped(feedId, roundId, currentPrice, SkipReason.InvalidData);
            m.updatesSkipped++;
            return;
        }
        
        // Determine if we should forward this update
        (bool shouldForward, UpdateReason reason) = _shouldForward(
            config,
            currentPrice,
            updatedAt
        );
        
        if (!shouldForward) {
            emit UpdateSkipped(
                feedId, 
                roundId, 
                currentPrice,
                _getSkipReason(config, currentPrice, updatedAt)
            );
            m.updatesSkipped++;
            m.estimatedGasSaved += 200000; // Estimated gas saved per skip
            return;
        }
        
        // Forward update to destination chain
        _forwardUpdate(
            config,
            feedId,
            roundId,
            currentPrice,
            updatedAt,
            reason
        );
        
        // Update state
        config.lastSentPrice = currentPrice;
        config.lastSentTime = block.timestamp;
        
        // Update metrics
        m.updatesForwarded++;
        if (reason == UpdateReason.DeviationThreshold) {
            m.deviationTriggered++;
        } else if (reason == UpdateReason.HeartbeatExpired) {
            m.heartbeatTriggered++;
        }
    }
    
    // ============ Internal Logic ============
    
    /**
     * @notice Determine if update should be forwarded based on deviation and heartbeat
     */
    function _shouldForward(
        FeedConfig memory config,
        int256 newPrice,
        uint256 updatedAt
    ) internal view returns (bool shouldForward, UpdateReason reason) {
        // First update always goes through
        if (config.lastSentPrice == 0) {
            return (true, UpdateReason.FirstUpdate);
        }
        
        // Check deviation threshold
        uint256 deviation = _calculateDeviation(newPrice, config.lastSentPrice);
        if (deviation >= config.deviationThreshold) {
            return (true, UpdateReason.DeviationThreshold);
        }
        
        // Check heartbeat
        if (block.timestamp - config.lastSentTime >= config.heartbeat) {
            return (true, UpdateReason.HeartbeatExpired);
        }
        
        return (false, UpdateReason.FirstUpdate);
    }
    
    /**
     * @notice Calculate price deviation in basis points
     */
    function _calculateDeviation(int256 newPrice, int256 oldPrice) 
        internal 
        pure 
        returns (uint256) 
    {
        if (oldPrice == 0) return BASIS_POINTS; // 100%
        
        int256 diff = newPrice > oldPrice 
            ? newPrice - oldPrice 
            : oldPrice - newPrice;
        
        return (uint256(diff) * BASIS_POINTS) / uint256(oldPrice);
    }
    
    /**
     * @notice Get skip reason for event
     */
    function _getSkipReason(
        FeedConfig memory config,
        int256 newPrice,
        uint256 updatedAt
    ) internal view returns (SkipReason) {
        if (newPrice <= 0) return SkipReason.InvalidData;
        
        uint256 deviation = _calculateDeviation(newPrice, config.lastSentPrice);
        if (deviation < config.deviationThreshold) {
            return SkipReason.InsufficientDeviation;
        }
        
        return SkipReason.WithinHeartbeat;
    }
    
    /**
     * @notice Forward update to destination chain via callback
     * @dev Uses Reactive Network's callback mechanism
     */
    function _forwardUpdate(
        FeedConfig memory config,
        bytes32 feedId,
        uint80 roundId,
        int256 price,
        uint256 updatedAt,
        UpdateReason reason
    ) internal {
        // Encode call to FeedProxy.updateRoundData()
        bytes memory payload = abi.encodeWithSignature(
            "updateRoundData(uint80,int256,uint256,uint80)",
            roundId,
            price,
            updatedAt,
            roundId  // answeredInRound = roundId
        );
        
        // Emit callback - Reactive Network handles delivery
        // Matches IReactive.Callback event signature
        emit Callback(
            uint256(config.destinationChainId),
            config.destinationProxy,
            uint64(1000000), // Gas limit for callback (1M gas)
            payload
        );
        
        emit UpdateForwarded(feedId, roundId, price, updatedAt, reason);
    }
    
    // ============ View Functions ============
    
    function getFeedConfig(bytes32 feedId) 
        external 
        view 
        returns (FeedConfig memory) 
    {
        return feeds[feedId];
    }
    
    function getFeedMetrics(bytes32 feedId) 
        external 
        view 
        returns (FeedMetrics memory) 
    {
        return metrics[feedId];
    }
    
    function getFeedCount() external view returns (uint256) {
        return feedIds.length;
    }
    
    function getAllFeeds() external view returns (bytes32[] memory) {
        return feedIds;
    }
    
    /**
     * @notice Calculate efficiency metrics for a feed
     * @return forwardRate Percentage of events that were forwarded (0-100)
     * @return gasSaved Estimated gas saved from skipped updates
     */
    function getEfficiency(bytes32 feedId) 
        external 
        view 
        returns (uint256 forwardRate, uint256 gasSaved) 
    {
        FeedMetrics memory m = metrics[feedId];
        
        if (m.totalEventsReceived == 0) {
            return (0, 0);
        }
        
        forwardRate = (m.updatesForwarded * 100) / m.totalEventsReceived;
        gasSaved = m.estimatedGasSaved;
    }
    
    /**
     * @notice Get comprehensive stats for all feeds
     */
    function getGlobalStats() external view returns (
        uint256 totalEvents,
        uint256 totalForwarded,
        uint256 totalSkipped,
        uint256 totalGasSaved,
        uint256 avgForwardRate
    ) {
        for (uint256 i = 0; i < feedIds.length; i++) {
            FeedMetrics memory m = metrics[feedIds[i]];
            totalEvents += m.totalEventsReceived;
            totalForwarded += m.updatesForwarded;
            totalSkipped += m.updatesSkipped;
            totalGasSaved += m.estimatedGasSaved;
        }
        
        if (totalEvents > 0) {
            avgForwardRate = (totalForwarded * 100) / totalEvents;
        }
    }
    
    // ============ Admin Functions ============
    
    function setFeedActive(bytes32 feedId, bool active) external onlyOwner {
        feeds[feedId].active = active;
    }
    
    function updateFeedConfig(
        bytes32 feedId,
        uint256 deviationThreshold,
        uint256 heartbeat
    ) external onlyOwner {
        require(deviationThreshold > 0 && deviationThreshold <= BASIS_POINTS, "Invalid deviation");
        require(heartbeat >= 1 minutes, "Heartbeat too short");
        
        FeedConfig storage config = feeds[feedId];
        config.deviationThreshold = deviationThreshold;
        config.heartbeat = heartbeat;
    }
    
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Invalid address");
        owner = newOwner;
    }

    // ============ IPayer Implementation ============

    /**
     * @notice Pay for Reactive Network services
     * @dev Called by Reactive Network system contract when payment is due
     * @param amount Amount owed for reactive transactions and callbacks
     */
    function pay(uint256 amount) external override {
        // Reactive Network will handle payment logic
        // This is a required function from IPayer interface
        // In production, ensure contract has sufficient balance
    }

    /**
     * @notice Allow contract to receive funds for operational expenses
     * @dev Required by IPayer interface for Reactive Network to fund the contract
     */
    receive() external payable override {
        // Contract can receive ETH for paying Reactive Network fees
    }
}