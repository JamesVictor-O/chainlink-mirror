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
     * @notice Modifier to ensure only Reactive Network VM can call react()
     * @dev This is a placeholder - in production, Reactive Network would implement proper access control
     */
    modifier vmOnly() {
        // In production, this would check that msg.sender is the Reactive Network VM
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
     * @notice Called by Reactive Network VM when a subscribed event is detected
     * @param chain The chain ID where the event originated
     * @param _contract The address of the contract that emitted the event
     * @param topic_0 The first indexed topic (event signature)
     * @param topic_1 The second indexed topic
     * @param topic_2 The third indexed topic
     * @param data The non-indexed event data (ABI encoded)
     * @param block_number The block number where the event occurred
     * @param op_code The operation code
     * @dev Must be implemented by child contracts with vmOnly modifier
     */
    function react(
        uint256 chain,
        address _contract,
        uint256 topic_0,
        uint256 topic_1,
        uint256 topic_2,
        bytes calldata data,
        uint256 block_number,
        uint256 op_code
    ) external virtual;
}

