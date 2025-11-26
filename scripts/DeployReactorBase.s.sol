// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {Script, console} from "forge-std/src/Script.sol";
import {ChainlinkFeedReactor} from "../contracts/reactive/ChainlinkFeedReactor.sol";

/// @notice Deploys ChainlinkFeedReactor to Base Mainnet with the polling-enabled contract.
contract DeployReactorBase is Script {
    function run() external returns (address) {
        uint256 deployerKey = vm.envUint("BASE_PRIVATE_KEY");

        vm.startBroadcast(deployerKey);

        ChainlinkFeedReactor reactor = new ChainlinkFeedReactor{value: 0}();
        console.log("ChainlinkFeedReactor deployed at %s", address(reactor));

        vm.stopBroadcast();
        return address(reactor);
    }
}

