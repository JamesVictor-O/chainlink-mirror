// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "../events/IChainlinkFeedReactorEvents.sol";

contract ChainlinkFeedReactor is IChainlinkFeedReactorEvents {
    
    uint256 constant BASIS_POINTS = 10000;
    uint256 constant DEFAULT_DEVIATION = 50; // 0.5%
    uint256 constant DEFAULT_HEARTBEAT = 1 hours;
    
    struct FeedConfig {
        uint64 originChainId;
        address feedAddress;
        uint64 destinationChainId;
        address destinationProxy;
        uint8 decimals;
        string description;
        uint256 deviationThreshold;
        uint256 heartbeat;
        int256 lastSentPrice;
        uint256 lastSentTime;
        uint80 lastProcessedRoundId;
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
    
    mapping(bytes32 => FeedConfig) public feeds;
    mapping(bytes32 => FeedMetrics) public metrics;
    bytes32[] public feedIds;
    
    address public owner;
    
    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }
    
    constructor() payable {
        owner = msg.sender;
    }
    
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
        
        bytes32 feedId = keccak256(abi.encodePacked(originChainId, feedAddress));
        require(feeds[feedId].feedAddress == address(0), "Feed already registered");
        
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
        
        emit FeedRegistered(
            feedId,
            originChainId,
            feedAddress,
            destinationChainId,
            destinationProxy
        );
        
        return feedId;
    }
    
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
    
    /**
     * @notice Check if update should be forwarded and return decision
     * @dev Does NOT update state - state is only updated via confirmForward()
     */
    function pollFeed(
        bytes32 feedId,
        uint80 roundId,
        int256 answer,
        uint256 updatedAt,
        uint80 answeredInRound
    ) external returns (bool shouldForward, UpdateReason reason) {
        FeedConfig storage config = feeds[feedId];
        FeedMetrics storage m = metrics[feedId];
        
        require(config.active && config.feedAddress != address(0), "Feed not active");
        
        // Check if duplicate round
        if (roundId <= config.lastProcessedRoundId) {
            emit UpdateSkipped(feedId, roundId, answer, SkipReason.InvalidData);
            return (false, UpdateReason.FirstUpdate);
        }
        
        // ✅ Update last processed round (prevent duplicate processing)
        config.lastProcessedRoundId = roundId;
        m.totalEventsReceived++;
        
        // Validate price
        if (answer <= 0) {
            emit UpdateSkipped(feedId, roundId, answer, SkipReason.InvalidData);
            m.updatesSkipped++;
            return (false, UpdateReason.FirstUpdate);
        }
        
        // ✅ Check if should forward (using updatedAt from Chainlink, not block.timestamp)
        (bool _shouldForward, UpdateReason _reason) = _shouldForward(
            config,
            answer,
            updatedAt  // Use Chainlink's timestamp
        );
        
        if (!_shouldForward) {
            emit UpdateSkipped(
                feedId, 
                roundId, 
                answer,
                _getSkipReason(config, answer, updatedAt)
            );
            m.updatesSkipped++;
            m.estimatedGasSaved += 200000;
            return (false, _reason);
        }
        
        // ✅ DO NOT update state here - let cron job call confirmForward() after successful FeedProxy update
        emit UpdateForwarded(feedId, roundId, answer, updatedAt, _reason);
        return (true, _reason);
    }
    
    /**
     * @notice Confirm that update was forwarded successfully
     * @dev Called by cron job AFTER FeedProxy.updateRoundData() succeeds
     */
    function confirmForward(
        bytes32 feedId,
        int256 answer,
        uint256 updatedAt,
        UpdateReason reason
    ) external {
        FeedConfig storage config = feeds[feedId];
        FeedMetrics storage m = metrics[feedId];
        
        require(config.active, "Feed not active");
        
        // ✅ NOW update state (using Chainlink's updatedAt timestamp)
        config.lastSentPrice = answer;
        config.lastSentTime = updatedAt;  // Use Chainlink timestamp, not block.timestamp
        
        // Update metrics
        m.updatesForwarded++;
        if (reason == UpdateReason.DeviationThreshold) {
            m.deviationTriggered++;
        } else if (reason == UpdateReason.HeartbeatExpired) {
            m.heartbeatTriggered++;
        }
    }
    
    function _shouldForward(
        FeedConfig memory config,
        int256 newPrice,
        uint256 updatedAt
    ) internal view returns (bool, UpdateReason) {
        // First update always forwards
        if (config.lastSentPrice == 0) {
            return (true, UpdateReason.FirstUpdate);
        }
        
        // Check deviation
        uint256 deviation = _calculateDeviation(newPrice, config.lastSentPrice);
        if (deviation >= config.deviationThreshold) {
            return (true, UpdateReason.DeviationThreshold);
        }
        
        // ✅ Check heartbeat using Chainlink's updatedAt vs last sent time
        if (updatedAt >= config.lastSentTime + config.heartbeat) {
            return (true, UpdateReason.HeartbeatExpired);
        }
        
        return (false, UpdateReason.FirstUpdate);
    }
    
    function _calculateDeviation(int256 newPrice, int256 oldPrice) 
        internal 
        pure 
        returns (uint256) 
    {
        if (oldPrice == 0) return BASIS_POINTS;
        
        int256 diff = newPrice > oldPrice 
            ? newPrice - oldPrice 
            : oldPrice - newPrice;
        
        return (uint256(diff) * BASIS_POINTS) / uint256(oldPrice);
    }
    
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

    receive() external payable {}
}