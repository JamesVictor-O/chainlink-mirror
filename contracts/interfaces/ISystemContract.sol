// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title ISystemContract
 * @notice Interface for Reactive Network's system contract
 * @dev Used to manage subscriptions in reactive contracts
 */
interface ISystemContract {
    /**
     * @notice Subscribe to events on a specific chain and contract
     * @param chain_id The chain ID to monitor
     * @param _contract The contract address to monitor (use address(0) for any)
     * @param topic_0 Event topic 0 (event signature)
     * @param topic_1 Event topic 1 (use REACTIVE_IGNORE for any)
     * @param topic_2 Event topic 2 (use REACTIVE_IGNORE for any)
     * @param topic_3 Event topic 3 (use REACTIVE_IGNORE for any)
     */
    function subscribe(
        uint256 chain_id,
        address _contract,
        uint256 topic_0,
        uint256 topic_1,
        uint256 topic_2,
        uint256 topic_3
    ) external;

    /**
     * @notice Unsubscribe from events
     * @param chain_id The chain ID
     * @param _contract The contract address
     * @param topic_0 Event topic 0
     * @param topic_1 Event topic 1
     * @param topic_2 Event topic 2
     * @param topic_3 Event topic 3
     */
    function unsubscribe(
        uint256 chain_id,
        address _contract,
        uint256 topic_0,
        uint256 topic_1,
        uint256 topic_2,
        uint256 topic_3
    ) external;
}

