// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {Script, console} from "forge-std/src/Script.sol";
import {FeedProxy} from "../contracts/destination/FeedProxy.sol";

contract DeployFeedProxyMantle is Script {
    uint8 constant DEFAULT_DECIMALS = 8;
    string constant DEFAULT_DESCRIPTION = "ETH/USD";
    uint256 constant DEFAULT_HEARTBEAT = 3600;

    function run() external returns (address) {
        uint256 deployerKey = vm.envUint("MANTLE_PRIVATE_KEY");
        uint8 decimals = uint8(_readEnvUint("FEED_DECIMALS", DEFAULT_DECIMALS));
        string memory description = _readEnvString("FEED_DESCRIPTION", DEFAULT_DESCRIPTION);
        uint256 heartbeat = _readEnvUint("FEED_HEARTBEAT", DEFAULT_HEARTBEAT);

        vm.startBroadcast(deployerKey);

        FeedProxy proxy = new FeedProxy(decimals, description, heartbeat);
        console.log("FeedProxy deployed at %s", address(proxy));
        console.log("Decimals: %s | Description: %s | Heartbeat: %s", decimals, description, heartbeat);

        vm.stopBroadcast();
        return address(proxy);
    }

    function _readEnvUint(string memory key, uint256 defaultValue) internal returns (uint256) {
        try vm.envUint(key) returns (uint256 value) {
            return value;
        } catch {
            return defaultValue;
        }
    }

    function _readEnvString(string memory key, string memory defaultValue)
        internal
        returns (string memory)
    {
        try vm.envString(key) returns (string memory value) {
            return value;
        } catch {
            return defaultValue;
        }
    }
}

