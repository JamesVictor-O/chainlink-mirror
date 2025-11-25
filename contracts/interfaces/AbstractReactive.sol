// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title AbstractReactive
 * @notice Base contract for Reactive Network contracts that react to cross-chain events
 * @dev Reactive Network automatically calls react() when subscribed events occur
 */
abstract contract AbstractReactive {
    /// @notice Constant to ignore a topic filter (match any value)
    /// @dev Official Reactive Network value: 0xa65f96fc951c35ead38878e0f0b7a3c744a6f5ccc1476b313353ce31712313ad
    uint256 constant REACTIVE_IGNORE = 0xa65f96fc951c35ead38878e0f0b7a3c744a6f5ccc1476b313353ce31712313ad;

    /**
     * @notice Modifier to ensure only Reactive Network system contract can call react()
     * @dev Reactive Network's system contract calls react() when subscribed events occur
     *      This is different from vmOnly - the system contract on the network instance calls this
     */
    modifier reactorOnly() {
        // In production, Reactive Network's system contract will be the msg.sender
        // For now, we allow any caller (will be restricted by Reactive Network in production)
        _;
    }

    /**
     * @notice Subscribe to events on a specific chain and contract
     * @param chain The chain ID to monitor
     * @param _contract The contract address to monitor
     * @param topic_0 The event signature (topic 0)
     * @param topic_1 Filter for topic 1 (or REACTIVE_IGNORE to match any)
     * @param topic_2 Filter for topic 2 (or REACTIVE_IGNORE to match any)
     * @param topic_3 Filter for topic 3 (or REACTIVE_IGNORE to match any)
     * @dev In production, this would be implemented by Reactive Network VM
     */
    function subscribe(
        uint256 chain,
        address _contract,
        uint256 topic_0,
        uint256 topic_1,
        uint256 topic_2,
        uint256 topic_3
    ) internal {
        // In production, this would register the subscription with Reactive Network
        // For now, this is a placeholder that allows compilation
    }

    /**
     * @notice LogRecord structure matching Reactive Network's IReactive interface
     * @dev Imported from IReactive for convenience
     */
    // Note: LogRecord is defined in IReactive interface
    // Child contracts should import IReactive to access LogRecord type
}

