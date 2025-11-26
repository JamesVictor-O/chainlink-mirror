
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";

contract FeedProxy is AggregatorV3Interface {
    
  
    /// @dev Packed round data for gas efficiency (56 bytes → 2 slots)
    struct RoundData {
        uint80 roundId;           // 10 bytes
        uint80 answeredInRound;
        uint256 startedAt;        // 10 bytes  
        uint32 updatedAt;         // 4 bytes (timestamp until year 2106)
        int256 answer;            // 32 bytes (separate slot)
    }
    uint8 private immutable _decimals;
    string private _description;
    uint256 private immutable _heartbeat;
    
    // Current state
    RoundData private _latestRound;
    mapping(uint80 => RoundData) private _rounds;
    
    // Access control
    address public owner;
    mapping(address => bool) public authorizedSenders;
    bool public paused;
    
    // Monitoring
    uint256 public totalUpdates;
    uint256 public lastUpdateGasUsed;
    
    // ============ Events ============
    
    event AnswerUpdated(
        int256 indexed current,
        uint256 indexed roundId,
        uint256 updatedAt
    );
    
    event NewRound(
        uint256 indexed roundId,
        address indexed startedBy,
        uint256 startedAt
    );
    
    event AuthorizedSenderUpdated(address indexed sender, bool authorized);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event EmergencyPaused(address indexed by);
    event EmergencyUnpaused(address indexed by);
    event StaleDataRejected(uint80 roundId, uint256 timeSinceUpdate);
    
    // ============ Errors ============
    
    error Unauthorized();
    error Paused();
    error InvalidRound();
    error InvalidAnswer();
    error StaleData();
    error NoDataAvailable();
    error InvalidAddress();
    
    // ============ Modifiers ============
    
    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }
    
    modifier onlyAuthorizedSender() {
        if (!authorizedSenders[msg.sender]) revert Unauthorized();
        _;
    }
    
    modifier whenNotPaused() {
        if (paused) revert Paused();
        _;
    }
    
    // ============ Constructor ============
    
    constructor(
        uint8 decimals_,
        string memory description_,
        uint256 heartbeat_
    ) {
        if (heartbeat_ == 0) revert InvalidAnswer();
        
        owner = msg.sender;
        _decimals = decimals_;
        _description = description_;
        _heartbeat = heartbeat_;
    }
    
    // ============ Core Update Function ============
    
    function updateRoundData(
        uint80 roundId,
        int256 answer,
        uint256 updatedAt,
        uint80 answeredInRound
    ) external onlyAuthorizedSender whenNotPaused {
        uint256 gasStart = gasleft();
        
        // Validation
        if (roundId <= _latestRound.roundId) revert InvalidRound();
        if (answer <= 0) revert InvalidAnswer();
        

        uint256 secondsSinceUpdate = block.timestamp - updatedAt;
        if (secondsSinceUpdate > _heartbeat * 2) {
            emit StaleDataRejected(roundId, secondsSinceUpdate);
            revert StaleData();
        }
        
        // Store new round data
        RoundData memory newRound = RoundData({
            roundId: roundId,
            answeredInRound: answeredInRound,
            startedAt: updatedAt,
            updatedAt: uint32(updatedAt),
            answer: answer
        });
        
        _latestRound = newRound;
        _rounds[roundId] = newRound;
        
        // Update metrics
        totalUpdates++;
        lastUpdateGasUsed = gasStart - gasleft();
        
        // Emit events
        emit NewRound(roundId, msg.sender, updatedAt);
        emit AnswerUpdated(answer, roundId, updatedAt);
    }
    
    // ============ AggregatorV3Interface Implementation ============
    
    function decimals() external view override returns (uint8) {
        return _decimals;
    }
    
    function description() external view override returns (string memory) {
        return _description;
    }
    
    function version() external pure override returns (uint256) {
        return 1;
    }
    
    function latestRoundData()
        external
        view
        override
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        )
    {
        if (_latestRound.updatedAt == 0) revert NoDataAvailable();
        
        RoundData memory latest = _latestRound;
        
        return (
            latest.roundId,
            latest.answer,
            latest.updatedAt, // Using updatedAt as startedAt (approximation)
            latest.updatedAt,
            latest.answeredInRound
        );
    }
    
    function getRoundData(uint80 _roundId)
        external
        view
        override
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        )
    {
        RoundData memory round = _rounds[_roundId];
        if (round.updatedAt == 0) revert NoDataAvailable();
        
        return (
            round.roundId,
            round.answer,
            round.updatedAt,
            round.updatedAt,
            round.answeredInRound
        );
    }
    
    // ============ View Functions for Monitoring ============
    
    /**
     * @notice Check if feed data is fresh
     * @return bool True if last update was within heartbeat period
     */
    function isFeedFresh() external view returns (bool) {
        if (_latestRound.updatedAt == 0) return false;
        return (block.timestamp - _latestRound.updatedAt) <= _heartbeat;
    }
    
    /**
     * @notice Get time since last update
     * @return uint256 Seconds since last update
     */
    function timeSinceUpdate() external view returns (uint256) {
        if (_latestRound.updatedAt == 0) return type(uint256).max;
        return block.timestamp - _latestRound.updatedAt;
    }
    
    /**
     * @notice Get feed health metrics
     * @return isHealthy Feed is healthy (data fresh, not paused)
     * @return secondsSinceUpdate Time since last update
     * @return isPaused Contract is paused
     */
    function healthCheck() external view returns (
        bool isHealthy,
        uint256 secondsSinceUpdate,
        bool isPaused
    ) {
        secondsSinceUpdate = _latestRound.updatedAt == 0 
            ? type(uint256).max 
            : block.timestamp - _latestRound.updatedAt;
        
        isHealthy = !paused && 
                    _latestRound.updatedAt > 0 && 
                    secondsSinceUpdate <= _heartbeat;
        
        isPaused = paused;
    }
    
    // ============ Admin Functions ============
    
    function addAuthorizedSender(address sender) external onlyOwner {
        if (sender == address(0)) revert InvalidAddress();
        authorizedSenders[sender] = true;
        emit AuthorizedSenderUpdated(sender, true);
    }
    
    function removeAuthorizedSender(address sender) external onlyOwner {
        authorizedSenders[sender] = false;
        emit AuthorizedSenderUpdated(sender, false);
    }
    
    function pause() external onlyOwner {
        paused = true;
        emit EmergencyPaused(msg.sender);
    }
    
    function unpause() external onlyOwner {
        paused = false;
        emit EmergencyUnpaused(msg.sender);
    }
    
    function updateDescription(string memory newDescription) external onlyOwner {
        _description = newDescription;
    }
    
    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert InvalidAddress();
        address oldOwner = owner;
        owner = newOwner;
        emit OwnershipTransferred(oldOwner, newOwner);
    }
    
    // ============ Getter for Heartbeat ============
    
    function heartbeat() external view returns (uint256) {
        return _heartbeat;
    }
}