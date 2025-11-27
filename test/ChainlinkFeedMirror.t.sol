// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "../contracts/reactive/ChainlinkFeedReactor.sol";
import "../contracts/destination/FeedProxy.sol";
import "../contracts/interfaces/IReactive.sol";
import "../contracts/interfaces/ISystemContract.sol";

contract MockSystemContract is ISystemContract {
    function subscribe(
        uint256,
        address,
        uint256,
        uint256,
        uint256,
        uint256
    ) external override {}

    function unsubscribe(
        uint256,
        address,
        uint256,
        uint256,
        uint256,
        uint256
    ) external override {}
}

contract ProxyUpdater {
    FeedProxy public immutable proxy;

    constructor(FeedProxy _proxy) {
        proxy = _proxy;
    }

    function update(
        uint80 roundId,
        int256 answer,
        uint256 updatedAt,
        uint80 answeredInRound
    ) external {
        proxy.updateRoundData(roundId, answer, updatedAt, answeredInRound);
    }
}

contract ChainlinkFeedMirrorTest {
    ChainlinkFeedReactor reactor;
    FeedProxy proxy;
MockSystemContract system;
ProxyUpdater updater;
    bytes32 feedId;

    /// @dev Chainlink AnswerUpdated event signature
    bytes32 constant ANSWER_UPDATED_TOPIC =
        0x0559884fd3a460db3073b7fc896cc77986f16e378210ded43186175bf646fc5f;

    function setUp() public {
        system = new MockSystemContract();
        reactor = new ChainlinkFeedReactor(address(system));
        proxy = new FeedProxy(8, "ETH/USD", 3600);

        reactor.registerFeed(
            11155111,
            address(0xfeed),
            97,
            address(proxy),
            8,
            "ETH/USD",
            50,
            3600
        );

        feedId = keccak256(abi.encodePacked(uint64(11155111), address(0xfeed)));
        proxy.addAuthorizedSender(address(reactor));
        updater = new ProxyUpdater(proxy);
        proxy.addAuthorizedSender(address(updater));
    }

    function testPollFeedForwardsUpdate() public {
        uint256 mockPrice = 2500 * 1e8;
        uint80 mockRoundId = 1;
        uint256 mockUpdatedAt = block.timestamp;

        reactor.pollFeed(feedId, mockRoundId, int256(mockPrice), mockUpdatedAt, mockRoundId);

        updater.update(mockRoundId, int256(mockPrice), mockUpdatedAt, mockRoundId);

        (uint80 roundId, int256 answer, , uint256 updatedAt, uint80 answeredInRound) =
            proxy.latestRoundData();

        require(roundId == mockRoundId, "roundId mismatch");
        require(answer == int256(mockPrice), "answer mismatch");
        require(updatedAt == mockUpdatedAt, "updatedAt mismatch");
        require(answeredInRound == mockRoundId, "answeredInRound mismatch");
    }
}

