// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title IChainlinkFeedReactorEvents
 * @notice Events emitted by ChainlinkFeedReactor contract
 * @dev Separated for cleaner contract organization
 */
interface IChainlinkFeedReactorEvents {
    /**
     * @notice Emitted when a new feed is registered
     * @param feedId Unique identifier for the feed
     * @param originChainId Chain ID where Chainlink feed exists
     * @param feedAddress Address of Chainlink aggregator
     * @param destinationChainId Chain ID where feed should be mirrored
     * @param destinationProxy Address of FeedProxy contract on destination
     */
    event FeedRegistered(
        bytes32 indexed feedId,
        uint64 originChainId,
        address feedAddress,
        uint64 destinationChainId,
        address destinationProxy
    );
    
    /**
     * @notice Emitted when an update is forwarded to destination chain
     * @param feedId Feed identifier
     * @param roundId Chainlink round ID
     * @param price Price value
     * @param updatedAt Timestamp when price was updated
     * @param reason Reason for forwarding the update
     */
    event UpdateForwarded(
        bytes32 indexed feedId,
        uint80 roundId,
        int256 price,
        uint256 updatedAt,
        UpdateReason reason
    );
    
    /**
     * @notice Emitted when an update is skipped (filtered out)
     * @param feedId Feed identifier
     * @param roundId Chainlink round ID
     * @param price Price value
     * @param reason Reason for skipping the update
     */
    event UpdateSkipped(
        bytes32 indexed feedId,
        uint80 roundId,
        int256 price,
        SkipReason reason
    );
    
    // Note: Callback event is inherited from IReactive interface
    // No need to redefine it here
    
    /**
     * @notice Reasons for forwarding an update
     */
    enum UpdateReason {
        FirstUpdate,
        DeviationThreshold,
        HeartbeatExpired
    }
    
    /**
     * @notice Reasons for skipping an update
     */
    enum SkipReason {
        InsufficientDeviation,
        WithinHeartbeat,
        InvalidData
    }
}

