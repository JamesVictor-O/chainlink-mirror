import assert from "node:assert/strict";
import { describe, it, before } from "node:test";
import { network } from "hardhat";
import { parseEther, parseUnits } from "viem";
import { getAddress, type Address } from "viem";

describe("FeedProxy", async function () {
  const { viem } = await network.connect();
  const publicClient = await viem.getPublicClient();
  const [owner, authorizedSender, unauthorizedSender] =
    await viem.getWalletClients();

  let feedProxy: any;
  const decimals = 8;
  const description = "ETH/USD";
  const heartbeat = 3600n; // 1 hour

  before(async function () {
    feedProxy = await viem.deployContract("FeedProxy", [
      decimals,
      description,
      heartbeat,
    ]);
  });

  describe("Constructor", function () {
    it("Should set correct initial values", async function () {
      assert.equal(await feedProxy.read.decimals(), decimals);
      assert.equal(await feedProxy.read.description(), description);
      assert.equal(await feedProxy.read.heartbeat(), heartbeat);
      assert.equal(await feedProxy.read.owner(), owner.account.address);
      assert.equal(await feedProxy.read.paused(), false);
      assert.equal(await feedProxy.read.totalUpdates(), 0n);
    });

    it("Should revert with zero heartbeat", async function () {
      await assert.rejects(
        viem.deployContract("FeedProxy", [decimals, description, 0n]),
        /InvalidAnswer|revert/
      );
    });
  });

  describe("Access Control", function () {
    it("Should allow owner to add authorized sender", async function () {
      await viem.assertions.emitWithArgs(
        feedProxy.write.addAuthorizedSender(
          [authorizedSender.account.address],
          {
            account: owner.account,
          }
        ),
        feedProxy,
        "AuthorizedSenderUpdated",
        [authorizedSender.account.address, true]
      );

      assert.equal(
        await feedProxy.read.authorizedSenders([
          authorizedSender.account.address,
        ]),
        true
      );
    });

    it("Should allow owner to remove authorized sender", async function () {
      await viem.assertions.emitWithArgs(
        feedProxy.write.removeAuthorizedSender(
          [authorizedSender.account.address],
          {
            account: owner.account,
          }
        ),
        feedProxy,
        "AuthorizedSenderUpdated",
        [authorizedSender.account.address, false]
      );

      assert.equal(
        await feedProxy.read.authorizedSenders([
          authorizedSender.account.address,
        ]),
        false
      );

      // Re-add for other tests
      await feedProxy.write.addAuthorizedSender(
        [authorizedSender.account.address],
        {
          account: owner.account,
        }
      );
    });

    it("Should revert when non-owner tries to add authorized sender", async function () {
      await assert.rejects(
        feedProxy.write.addAuthorizedSender(
          [unauthorizedSender.account.address],
          {
            account: unauthorizedSender.account,
          }
        ),
        /Unauthorized|Not owner/
      );
    });

    it("Should revert when adding zero address", async function () {
      await assert.rejects(
        feedProxy.write.addAuthorizedSender(
          ["0x0000000000000000000000000000000000000000"],
          {
            account: owner.account,
          }
        ),
        /InvalidAddress/
      );
    });

    it("Should allow owner to transfer ownership", async function () {
      const newOwner = unauthorizedSender.account.address;

      await viem.assertions.emitWithArgs(
        feedProxy.write.transferOwnership([newOwner], {
          account: owner.account,
        }),
        feedProxy,
        "OwnershipTransferred",
        [owner.account.address, newOwner]
      );

      assert.equal(await feedProxy.read.owner(), newOwner);

      // Transfer back for other tests
      await feedProxy.write.transferOwnership([owner.account.address], {
        account: newOwner as Address,
      });
    });
  });

  describe("updateRoundData", function () {
    it("Should update round data when called by authorized sender", async function () {
      const roundId = 1n;
      const answer = parseUnits("3000", decimals);
      const updatedAt = BigInt(Math.floor(Date.now() / 1000));
      const answeredInRound = 1n;

      await viem.assertions.emitWithArgs(
        feedProxy.write.updateRoundData(
          [roundId, answer, updatedAt, answeredInRound],
          { account: authorizedSender.account }
        ),
        feedProxy,
        "AnswerUpdated",
        [answer, roundId, updatedAt]
      );

      await viem.assertions.emitWithArgs(
        feedProxy.write.updateRoundData(
          [roundId, answer, updatedAt, answeredInRound],
          { account: authorizedSender.account }
        ),
        feedProxy,
        "NewRound",
        [roundId, authorizedSender.account.address, updatedAt]
      );

      assert.equal(await feedProxy.read.totalUpdates(), 1n);
    });

    it("Should revert when called by unauthorized sender", async function () {
      const roundId = 2n;
      const answer = parseUnits("3100", decimals);
      const updatedAt = BigInt(Math.floor(Date.now() / 1000));
      const answeredInRound = 2n;

      await assert.rejects(
        feedProxy.write.updateRoundData(
          [roundId, answer, updatedAt, answeredInRound],
          { account: unauthorizedSender.account }
        ),
        /Unauthorized/
      );
    });

    it("Should revert with stale round ID", async function () {
      const roundId = 1n; // Same as previous
      const answer = parseUnits("3200", decimals);
      const updatedAt = BigInt(Math.floor(Date.now() / 1000));
      const answeredInRound = 1n;

      await assert.rejects(
        feedProxy.write.updateRoundData(
          [roundId, answer, updatedAt, answeredInRound],
          { account: authorizedSender.account }
        ),
        /InvalidRound/
      );
    });

    it("Should revert with invalid answer (zero or negative)", async function () {
      const roundId = 3n;
      const updatedAt = BigInt(Math.floor(Date.now() / 1000));
      const answeredInRound = 3n;

      // Test zero
      await assert.rejects(
        feedProxy.write.updateRoundData(
          [roundId, 0n, updatedAt, answeredInRound],
          { account: authorizedSender.account }
        ),
        /InvalidAnswer/
      );

      // Test negative
      await assert.rejects(
        feedProxy.write.updateRoundData(
          [roundId, -1000n, updatedAt, answeredInRound],
          { account: authorizedSender.account }
        ),
        /InvalidAnswer/
      );
    });

    it("Should revert with stale data (too old)", async function () {
      const roundId = 4n;
      const answer = parseUnits("3300", decimals);
      const updatedAt = BigInt(Math.floor(Date.now() / 1000)) - heartbeat * 3n; // Too old
      const answeredInRound = 4n;

      await assert.rejects(
        feedProxy.write.updateRoundData(
          [roundId, answer, updatedAt, answeredInRound],
          { account: authorizedSender.account }
        ),
        /StaleData/
      );
    });

    it("Should store multiple rounds correctly", async function () {
      const roundId1 = 5n;
      const roundId2 = 6n;
      const answer1 = parseUnits("3400", decimals);
      const answer2 = parseUnits("3500", decimals);
      const updatedAt = BigInt(Math.floor(Date.now() / 1000));
      const answeredInRound1 = 5n;
      const answeredInRound2 = 6n;

      await feedProxy.write.updateRoundData(
        [roundId1, answer1, updatedAt, answeredInRound1],
        { account: authorizedSender.account }
      );

      await feedProxy.write.updateRoundData(
        [roundId2, answer2, updatedAt + 1n, answeredInRound2],
        { account: authorizedSender.account }
      );

      const round1 = await feedProxy.read.getRoundData([roundId1]);
      const round2 = await feedProxy.read.getRoundData([roundId2]);

      assert.equal(round1[0], roundId1);
      assert.equal(round1[1], answer1);
      assert.equal(round2[0], roundId2);
      assert.equal(round2[1], answer2);
    });
  });

  describe("AggregatorV3Interface", function () {
    before(async function () {
      // Ensure we have data
      const roundId = 7n;
      const answer = parseUnits("3600", decimals);
      const updatedAt = BigInt(Math.floor(Date.now() / 1000));
      const answeredInRound = 7n;

      await feedProxy.write.updateRoundData(
        [roundId, answer, updatedAt, answeredInRound],
        { account: authorizedSender.account }
      );
    });

    it("Should return correct decimals", async function () {
      assert.equal(await feedProxy.read.decimals(), decimals);
    });

    it("Should return correct description", async function () {
      assert.equal(await feedProxy.read.description(), description);
    });

    it("Should return correct version", async function () {
      assert.equal(await feedProxy.read.version(), 1n);
    });

    it("Should return latest round data", async function () {
      const [roundId, answer, startedAt, updatedAt, answeredInRound] =
        await feedProxy.read.latestRoundData();

      assert.equal(roundId, 7n);
      assert.equal(answer, parseUnits("3600", decimals));
      assert.equal(answeredInRound, 7n);
    });

    it("Should return specific round data", async function () {
      const [roundId, answer, startedAt, updatedAt, answeredInRound] =
        await feedProxy.read.getRoundData([7n]);

      assert.equal(roundId, 7n);
      assert.equal(answer, parseUnits("3600", decimals));
      assert.equal(answeredInRound, 7n);
    });

    it("Should revert when no data available", async function () {
      const newProxy = await viem.deployContract("FeedProxy", [
        decimals,
        description,
        heartbeat,
      ]);

      await assert.rejects(newProxy.read.latestRoundData(), /NoDataAvailable/);
      await assert.rejects(newProxy.read.getRoundData([1n]), /NoDataAvailable/);
    });
  });

  describe("Pause/Unpause", function () {
    it("Should allow owner to pause", async function () {
      await viem.assertions.emitWithArgs(
        feedProxy.write.pause({ account: owner.account }),
        feedProxy,
        "EmergencyPaused",
        [owner.account.address]
      );

      assert.equal(await feedProxy.read.paused(), true);
    });

    it("Should prevent updates when paused", async function () {
      const roundId = 8n;
      const answer = parseUnits("3700", decimals);
      const updatedAt = BigInt(Math.floor(Date.now() / 1000));
      const answeredInRound = 8n;

      await assert.rejects(
        feedProxy.write.updateRoundData(
          [roundId, answer, updatedAt, answeredInRound],
          { account: authorizedSender.account }
        ),
        /Paused/
      );
    });

    it("Should allow owner to unpause", async function () {
      await viem.assertions.emitWithArgs(
        feedProxy.write.unpause({ account: owner.account }),
        feedProxy,
        "EmergencyUnpaused",
        [owner.account.address]
      );

      assert.equal(await feedProxy.read.paused(), false);
    });
  });

  describe("Health Checks", function () {
    it("Should return correct feed freshness", async function () {
      const isFresh = await feedProxy.read.isFeedFresh();
      assert.equal(typeof isFresh, "boolean");
    });

    it("Should return time since update", async function () {
      const timeSince = await feedProxy.read.timeSinceUpdate();
      assert.equal(typeof timeSince, "bigint");
      assert(timeSince >= 0n);
    });

    it("Should return health check metrics", async function () {
      const [isHealthy, secondsSinceUpdate, isPaused] =
        await feedProxy.read.healthCheck();

      assert.equal(typeof isHealthy, "boolean");
      assert.equal(typeof secondsSinceUpdate, "bigint");
      assert.equal(typeof isPaused, "boolean");
      assert.equal(isPaused, await feedProxy.read.paused());
    });
  });

  describe("Description Update", function () {
    it("Should allow owner to update description", async function () {
      const newDescription = "BTC/USD";
      await feedProxy.write.updateDescription([newDescription], {
        account: owner.account,
      });

      assert.equal(await feedProxy.read.description(), newDescription);
    });
  });
});
