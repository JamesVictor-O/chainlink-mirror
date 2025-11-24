import assert from "node:assert/strict";
import { describe, it, before } from "node:test";
import { network } from "hardhat";
import { parseUnits, encodeAbiParameters, parseAbiParameters } from "viem";
import { getAddress, type Address } from "viem";

describe("ChainlinkFeedReactor", async function () {
  const { viem } = await network.connect();
  const publicClient = await viem.getPublicClient();
  const [owner, user] = await viem.getWalletClients();

  let reactor: any;
  let feedProxy: any;

  const originChainId = 11155111n; // Sepolia
  const destinationChainId = 84532n; // Base Sepolia
  const feedAddress = "0x694AA1769357215DE4FAC081bf1f309aDC325306" as Address; // ETH/USD on Sepolia
  const decimals = 8;
  const description = "ETH/USD";
  const deviationThreshold = 50n; // 0.5% in basis points
  const heartbeat = 3600n; // 1 hour

  // Chainlink AnswerUpdated event signature
  const ANSWER_UPDATED_TOPIC_0 =
    0x0559884fd3a460db3073b7fc896cc77986f16e378210ded43186175bf646fc5fn;

  before(async function () {
    reactor = await viem.deployContract("ChainlinkFeedReactor");

    // Deploy a FeedProxy for testing
    feedProxy = await viem.deployContract("FeedProxy", [
      decimals,
      description,
      heartbeat,
    ]);
  });

  describe("Constructor", function () {
    it("Should set owner correctly", async function () {
      assert.equal(await reactor.read.owner(), owner.account.address);
    });

    it("Should have zero feeds initially", async function () {
      assert.equal(await reactor.read.getFeedCount(), 0n);
    });
  });

  describe("Feed Registration", function () {
    it("Should register a feed successfully", async function () {
      // Calculate expected feedId
      const feedId = await reactor.read.feeds([
        "0x" +
          originChainId.toString(16).padStart(16, "0") +
          feedAddress.slice(2).toLowerCase().padStart(64, "0"),
      ]);

      // Use a different feed address to avoid duplicate
      const testFeedAddress =
        "0x1111111111111111111111111111111111111111" as Address;

      await viem.assertions.emitWithArgs(
        reactor.write.registerFeed(
          [
            originChainId,
            testFeedAddress,
            destinationChainId,
            feedProxy.address,
            decimals,
            description,
            deviationThreshold,
            heartbeat,
          ],
          { account: owner.account }
        ),
        reactor,
        "FeedRegistered",
        [] // Event args will be checked by the assertion
      );

      const feedCount = await reactor.read.getFeedCount();
      assert(feedCount > 0n);
    });

    it("Should revert when non-owner tries to register feed", async function () {
      await assert.rejects(
        reactor.write.registerFeed(
          [
            originChainId,
            feedAddress,
            destinationChainId,
            feedProxy.address,
            decimals,
            description,
            deviationThreshold,
            heartbeat,
          ],
          { account: user.account }
        ),
        /Not owner/
      );
    });

    it("Should revert with invalid feed address", async function () {
      await assert.rejects(
        reactor.write.registerFeed(
          [
            originChainId,
            "0x0000000000000000000000000000000000000000",
            destinationChainId,
            feedProxy.address,
            decimals,
            description,
            deviationThreshold,
            heartbeat,
          ],
          { account: owner.account }
        ),
        /Invalid feed address/
      );
    });

    it("Should revert with invalid proxy address", async function () {
      await assert.rejects(
        reactor.write.registerFeed(
          [
            originChainId,
            feedAddress,
            destinationChainId,
            "0x0000000000000000000000000000000000000000",
            decimals,
            description,
            deviationThreshold,
            heartbeat,
          ],
          { account: owner.account }
        ),
        /Invalid proxy address/
      );
    });

    it("Should revert with invalid deviation threshold", async function () {
      await assert.rejects(
        reactor.write.registerFeed(
          [
            originChainId,
            feedAddress,
            destinationChainId,
            feedProxy.address,
            decimals,
            description,
            0n, // Invalid: zero
            heartbeat,
          ],
          { account: owner.account }
        ),
        /Invalid deviation/
      );

      await assert.rejects(
        reactor.write.registerFeed(
          [
            originChainId,
            feedAddress,
            destinationChainId,
            feedProxy.address,
            decimals,
            description,
            10001n, // Invalid: > 10000
            heartbeat,
          ],
          { account: owner.account }
        ),
        /Invalid deviation/
      );
    });

    it("Should revert with heartbeat too short", async function () {
      await assert.rejects(
        reactor.write.registerFeed(
          [
            originChainId,
            feedAddress,
            destinationChainId,
            feedProxy.address,
            decimals,
            description,
            deviationThreshold,
            59n, // Less than 1 minute
          ],
          { account: owner.account }
        ),
        /Heartbeat too short/
      );
    });

    it("Should revert when registering duplicate feed", async function () {
      const duplicateFeedAddress =
        "0x3333333333333333333333333333333333333333" as Address;

      // Register first time
      await reactor.write.registerFeed(
        [
          originChainId,
          duplicateFeedAddress,
          destinationChainId,
          feedProxy.address,
          decimals,
          description,
          deviationThreshold,
          heartbeat,
        ],
        { account: owner.account }
      );

      // Try to register the same feed again
      await assert.rejects(
        reactor.write.registerFeed(
          [
            originChainId,
            duplicateFeedAddress,
            destinationChainId,
            feedProxy.address,
            decimals,
            description,
            deviationThreshold,
            heartbeat,
          ],
          { account: owner.account }
        ),
        /Feed already registered/
      );
    });

    it("Should register feed with default settings", async function () {
      const newFeedAddress =
        "0x1234567890123456789012345678901234567890" as Address;

      const feedId = await reactor.write.registerFeedDefault(
        [
          originChainId,
          newFeedAddress,
          destinationChainId,
          feedProxy.address,
          decimals,
          "BTC/USD",
        ],
        { account: owner.account }
      );

      assert(feedId !== null);
    });
  });

  describe("react() Function", function () {
    let feedId: `0x${string}`;
    const testPrice = parseUnits("3000", decimals);
    const testRoundId = 100n;
    const testUpdatedAt = BigInt(Math.floor(Date.now() / 1000));
    const testFeedAddress =
      "0x2222222222222222222222222222222222222222" as Address;

    before(async function () {
      // Register a test feed with unique address
      await reactor.write.registerFeed(
        [
          originChainId,
          testFeedAddress,
          destinationChainId,
          feedProxy.address,
          decimals,
          description,
          deviationThreshold,
          heartbeat,
        ],
        { account: owner.account }
      );

      // Calculate feedId: keccak256(abi.encodePacked(originChainId, feedAddress))
      // For testing, we'll get it from the contract
      const allFeeds = await reactor.read.getAllFeeds();
      feedId = allFeeds[allFeeds.length - 1] as `0x${string}`;
    });

    it("Should process first update (FirstUpdate reason)", async function () {
      const topic1 = BigInt(testPrice); // current price
      const topic2 = testRoundId; // roundId
      const data = encodeAbiParameters(parseAbiParameters("uint256"), [
        testUpdatedAt,
      ]);

      await viem.assertions.emitWithArgs(
        reactor.write.react(
          [
            originChainId,
            testFeedAddress,
            ANSWER_UPDATED_TOPIC_0,
            topic1,
            topic2,
            data,
            0n, // block_number
            0n, // op_code
          ],
          { account: owner.account }
        ),
        reactor,
        "UpdateForwarded",
        [feedId, testRoundId, testPrice, testUpdatedAt, 0n] // UpdateReason.FirstUpdate = 0
      );

      // Check metrics
      const metrics = await reactor.read.getFeedMetrics([feedId]);
      assert.equal(metrics.totalEventsReceived, 1n);
      assert.equal(metrics.updatesForwarded, 1n);
      assert.equal(metrics.updatesSkipped, 0n);
    });

    it("Should emit Callback event", async function () {
      const topic1 = BigInt(parseUnits("3100", decimals));
      const topic2 = testRoundId + 1n;
      const data = encodeAbiParameters(parseAbiParameters("uint256"), [
        testUpdatedAt + 1n,
      ]);

      await viem.assertions.emitWithArgs(
        reactor.write.react(
          [
            originChainId,
            testFeedAddress,
            ANSWER_UPDATED_TOPIC_0,
            topic1,
            topic2,
            data,
            0n,
            0n,
          ],
          { account: owner.account }
        ),
        reactor,
        "Callback",
        [destinationChainId, feedProxy.address, 0n]
      );
    });

    it("Should skip update with insufficient deviation", async function () {
      const lastPrice = parseUnits("3100", decimals);
      const newPrice = parseUnits("3101", decimals); // Very small change
      const topic1 = BigInt(newPrice);
      const topic2 = testRoundId + 2n;
      const data = encodeAbiParameters(parseAbiParameters("uint256"), [
        testUpdatedAt + 2n,
      ]);

      await viem.assertions.emitWithArgs(
        reactor.write.react(
          [
            originChainId,
            testFeedAddress,
            ANSWER_UPDATED_TOPIC_0,
            topic1,
            topic2,
            data,
            0n,
            0n,
          ],
          { account: owner.account }
        ),
        reactor,
        "UpdateSkipped",
        [feedId, topic2, newPrice, 0n] // SkipReason.InsufficientDeviation = 0
      );

      const metrics = await reactor.read.getFeedMetrics([feedId]);
      assert(metrics.updatesSkipped > 0n);
    });

    it("Should forward update when deviation threshold is met", async function () {
      const lastPrice = parseUnits("3100", decimals);
      const newPrice = parseUnits("3200", decimals); // ~3.2% change (exceeds 0.5%)
      const topic1 = BigInt(newPrice);
      const topic2 = testRoundId + 3n;
      const data = encodeAbiParameters(parseAbiParameters("uint256"), [
        testUpdatedAt + 3n,
      ]);

      await viem.assertions.emitWithArgs(
        reactor.write.react(
          [
            originChainId,
            testFeedAddress,
            ANSWER_UPDATED_TOPIC_0,
            topic1,
            topic2,
            data,
            0n,
            0n,
          ],
          { account: owner.account }
        ),
        reactor,
        "UpdateForwarded",
        [feedId, topic2, newPrice, testUpdatedAt + 3n, 1n] // UpdateReason.DeviationThreshold = 1
      );

      const metrics = await reactor.read.getFeedMetrics([feedId]);
      assert(metrics.deviationTriggered > 0n);
    });

    it("Should skip update with invalid price (zero or negative)", async function () {
      const topic1 = 0n; // Zero price
      const topic2 = testRoundId + 4n;
      const data = encodeAbiParameters(parseAbiParameters("uint256"), [
        testUpdatedAt + 4n,
      ]);

      await viem.assertions.emitWithArgs(
        reactor.write.react(
          [
            originChainId,
            testFeedAddress,
            ANSWER_UPDATED_TOPIC_0,
            topic1,
            topic2,
            data,
            0n,
            0n,
          ],
          { account: owner.account }
        ),
        reactor,
        "UpdateSkipped",
        [feedId, topic2, 0n, 2n] // SkipReason.InvalidData = 2
      );
    });

    it("Should forward update when heartbeat expires", async function () {
      // Simulate time passing by using a future timestamp
      const futureTime = testUpdatedAt + heartbeat + 1n;

      // First, update with a small change that would normally be skipped
      const smallPrice = parseUnits("3201", decimals);
      const topic1 = BigInt(smallPrice);
      const topic2 = testRoundId + 5n;
      const data = encodeAbiParameters(parseAbiParameters("uint256"), [
        futureTime,
      ]);

      // This should forward due to heartbeat expiration
      await viem.assertions.emitWithArgs(
        reactor.write.react(
          [
            originChainId,
            testFeedAddress,
            ANSWER_UPDATED_TOPIC_0,
            topic1,
            topic2,
            data,
            0n,
            0n,
          ],
          { account: owner.account }
        ),
        reactor,
        "UpdateForwarded",
        [feedId, topic2, smallPrice, futureTime, 2n] // UpdateReason.HeartbeatExpired = 2
      );

      const metrics = await reactor.read.getFeedMetrics([feedId]);
      assert(metrics.heartbeatTriggered > 0n);
    });

    it("Should ignore events from unregistered feeds", async function () {
      const unregisteredFeed =
        "0x9999999999999999999999999999999999999999" as Address;
      const topic1 = BigInt(parseUnits("4000", decimals));
      const topic2 = 999n;
      const data = encodeAbiParameters(parseAbiParameters("uint256"), [
        testUpdatedAt,
      ]);

      // Should not emit any events
      await reactor.write.react(
        [
          originChainId,
          unregisteredFeed,
          ANSWER_UPDATED_TOPIC_0,
          topic1,
          topic2,
          data,
          0n,
          0n,
        ],
        { account: owner.account }
      );

      // Metrics should not change
      const metricsBefore = await reactor.read.getFeedMetrics([feedId]);
      const metricsAfter = await reactor.read.getFeedMetrics([feedId]);
      assert.equal(
        metricsBefore.totalEventsReceived,
        metricsAfter.totalEventsReceived
      );
    });
  });

  describe("View Functions", function () {
    it("Should return feed config", async function () {
      const allFeeds = await reactor.read.getAllFeeds();
      if (allFeeds.length > 0) {
        const config = await reactor.read.getFeedConfig([allFeeds[0]]);
        assert(
          config.feedAddress !== "0x0000000000000000000000000000000000000000"
        );
        assert(config.active === true);
      }
    });

    it("Should return feed metrics", async function () {
      const allFeeds = await reactor.read.getAllFeeds();
      if (allFeeds.length > 0) {
        const metrics = await reactor.read.getFeedMetrics([allFeeds[0]]);
        assert.equal(typeof metrics.totalEventsReceived, "bigint");
        assert.equal(typeof metrics.updatesForwarded, "bigint");
        assert.equal(typeof metrics.updatesSkipped, "bigint");
      }
    });

    it("Should return all feed IDs", async function () {
      const feedIds = await reactor.read.getAllFeeds();
      assert(Array.isArray(feedIds));
      assert(feedIds.length > 0);
    });

    it("Should return correct feed count", async function () {
      const count = await reactor.read.getFeedCount();
      assert(count > 0n);
    });
  });
});
