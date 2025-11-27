// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {Script, console} from "forge-std/src/Script.sol";
import {FeedProxy} from "../contracts/destination/FeedProxy.sol";

contract DeployFeedProxyBase is Script {
    uint8 constant DEFAULT_DECIMALS = 8;
    string constant DEFAULT_DESCRIPTION = "ETH/USD";
    uint256 constant DEFAULT_HEARTBEAT = 3600;

    function run() external returns (address) {
        uint256 deployerKey = vm.envUint("BASE_PRIVATE_KEY");
        uint256 decimalsRaw = DEFAULT_DECIMALS;
        try vm.envUint("FEED_DECIMALS") returns (uint256 value) {
            decimalsRaw = value;
        } catch {}

        string memory description = DEFAULT_DESCRIPTION;
        try vm.envString("FEED_DESCRIPTION") returns (string memory value) {
            description = value;
        } catch {}

        uint256 heartbeat = DEFAULT_HEARTBEAT;
        try vm.envUint("FEED_HEARTBEAT") returns (uint256 value) {
            heartbeat = value;
        } catch {}

        uint8 decimals = uint8(decimalsRaw);

        vm.startBroadcast(deployerKey);

        FeedProxy proxy = new FeedProxy(decimals, description, heartbeat);
        console.log("FeedProxy deployed at %s", address(proxy));
        console.log("Decimals: %s, Description: %s, Heartbeat: %s", decimals, description, heartbeat);

        vm.stopBroadcast();
        return address(proxy);
    }
}

