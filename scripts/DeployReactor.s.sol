// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {Script, console} from "forge-std/src/Script.sol";
import {ChainlinkFeedReactor} from "../contracts/reactive/ChainlinkFeedReactor.sol";

contract DeployReactor is Script {
    function run() external returns (address) {
        vm.startBroadcast();

        ChainlinkFeedReactor reactor = new ChainlinkFeedReactor{value: 0}();

        console.log("ChainlinkFeedReactor deployed at:", address(reactor));

        vm.stopBroadcast();

        return address(reactor);
    }
}

