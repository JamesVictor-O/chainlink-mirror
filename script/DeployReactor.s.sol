// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {Script, console} from "forge-std/src/Script.sol";
import {ChainlinkFeedReactor} from "../contracts/reactive/ChainlinkFeedReactor.sol";

contract DeployReactor is Script {
    // System contract address on Reactive Network
    address constant SYSTEM_CONTRACT = 0x0000000000000000000000000000000000fffFfF;
    
    function run() external {
        // Private key is passed via --private-key flag
        vm.startBroadcast();
        
        ChainlinkFeedReactor reactor = new ChainlinkFeedReactor{value: 0}(SYSTEM_CONTRACT);
        
        vm.stopBroadcast();
        
        console.log("ChainlinkFeedReactor deployed at:", address(reactor));
    }
}

