/**
 * Script to check subscription status on Reactive Network
 * Attempts to verify subscription by checking contract state and events
 *
 * Usage:
 *   npx hardhat run scripts/check-reactscan-subscription.ts --network reactive
 */

import { createPublicClient, http, defineChain } from "viem";
import * as fs from "fs";
import * as path from "path";

const reactiveTestnetChain = defineChain({
  id: 5318007,
  name: "Lasna Testnet",
  nativeCurrency: {
    decimals: 18,
    name: "Ether",
    symbol: "ETH",
  },
  rpcUrls: {
    default: {
      http: [
        process.env.REACTIVE_TESTNET_RPC_URL || "https://lasna-rpc.rnk.dev",
      ],
    },
  },
  blockExplorers: {
    default: {
      name: "Reactscan Lasna",
      url: "https://lasna.reactscan.io",
    },
  },
});

async function main() {
  const reactorAddress =
    process.env.REACTOR_ADDRESS || "0xbb0043babcc6be0a6c72415ee8e6221812534311";

  console.log("🔍 Checking Subscription Status on Reactive Network\n");
  console.log("=".repeat(60));
  console.log("📝 Reactor Address:", reactorAddress);
  console.log("🌐 Network: Lasna Testnet (5318007)");
  console.log("");

  const rpcUrl =
    process.env.REACTIVE_TESTNET_RPC_URL || "https://lasna-rpc.rnk.dev";
  const publicClient = createPublicClient({
    chain: reactiveTestnetChain,
    transport: http(rpcUrl),
  });

  // Load contract ABI
  const artifactPath = path.join(
    process.cwd(),
    "artifacts/contracts/reactive/ChainlinkFeedReactor.sol/ChainlinkFeedReactor.json"
  );
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf-8"));
  const abi = artifact.abi;

  try {
    console.log("=".repeat(60));
    console.log("1️⃣  Contract State");
    console.log("=".repeat(60));

    // Check system contract
    const systemContract = await publicClient
      .readContract({
        address: reactorAddress as `0x${string}`,
        abi: abi,
        functionName: "getSystemContract",
      })
      .catch(() => {
        // Fallback to service variable
        return publicClient.readContract({
          address: reactorAddress as `0x${string}`,
          abi: abi,
          functionName: "service",
        });
      });

    console.log("✅ System Contract:", systemContract);
    if (systemContract === "0x0000000000000000000000000000000000000000") {
      console.log("   ⚠️  System contract not set!");
    } else {
      console.log("   ✅ System contract configured");
    }
    console.log("");

    // Check feed count
    const feedCount = await publicClient.readContract({
      address: reactorAddress as `0x${string}`,
      abi: abi,
      functionName: "getFeedCount",
    });
    console.log("📊 Registered Feeds:", feedCount.toString());
    console.log("");

    // Get all feeds
    const feedIds = await publicClient.readContract({
      address: reactorAddress as `0x${string}`,
      abi: abi,
      functionName: "getAllFeeds",
    });

    if (feedIds.length > 0) {
      console.log("📋 Feed Details:");
      for (const feedId of feedIds) {
        const config = await publicClient.readContract({
          address: reactorAddress as `0x${string}`,
          abi: abi,
          functionName: "getFeedConfig",
          args: [feedId],
        });

        const metrics = await publicClient.readContract({
          address: reactorAddress as `0x${string}`,
          abi: abi,
          functionName: "getFeedMetrics",
          args: [feedId],
        });

        console.log(`\n   Feed ID: ${feedId}`);
        console.log(`   Origin Chain: ${config.originChainId}`);
        console.log(`   Feed Address: ${config.feedAddress}`);
        console.log(`   Destination Chain: ${config.destinationChainId}`);
        console.log(`   Active: ${config.active}`);
        console.log(`   Description: ${config.description}`);
        console.log(`   Events Received: ${metrics.totalEventsReceived}`);
        console.log(`   Updates Forwarded: ${metrics.updatesForwarded}`);
        console.log(`   Updates Skipped: ${metrics.updatesSkipped}`);
      }
    }
    console.log("");

    console.log("=".repeat(60));
    console.log("2️⃣  FeedRegistered Events");
    console.log("=".repeat(60));

    // Check for FeedRegistered events
    const currentBlock = await publicClient.getBlockNumber();
    const fromBlock = currentBlock > 10000n ? currentBlock - 10000n : 0n;

    const feedRegisteredEvents = await publicClient.getLogs({
      address: reactorAddress as `0x${string}`,
      event: {
        type: "event",
        name: "FeedRegistered",
        inputs: [
          { type: "bytes32", indexed: true, name: "feedId" },
          { type: "uint64", indexed: false, name: "originChainId" },
          { type: "address", indexed: false, name: "feedAddress" },
          { type: "uint64", indexed: false, name: "destinationChainId" },
          { type: "address", indexed: false, name: "destinationProxy" },
        ],
      },
      fromBlock: fromBlock,
      toBlock: currentBlock,
    });

    console.log(
      `✅ Found ${feedRegisteredEvents.length} FeedRegistered event(s)\n`
    );

    if (feedRegisteredEvents.length > 0) {
      for (const event of feedRegisteredEvents) {
        const block = await publicClient.getBlock({
          blockNumber: event.blockNumber,
        });
        const timestamp = Number(block.timestamp) * 1000;
        const timeAgo = Math.floor((Date.now() - timestamp) / 1000);

        console.log("   Event Details:");
        console.log(`   Block: ${event.blockNumber}`);
        console.log(`   Transaction: ${event.transactionHash}`);
        console.log(
          `   Time: ${new Date(timestamp).toISOString()} (${formatTime(
            timeAgo
          )} ago)`
        );
        console.log(`   Origin Chain: ${event.args.originChainId}`);
        console.log(`   Feed Address: ${event.args.feedAddress}`);
        console.log(`   Destination Chain: ${event.args.destinationChainId}`);
        console.log("");
      }
    }

    console.log("=".repeat(60));
    console.log("3️⃣  Subscription Verification");
    console.log("=".repeat(60));

    console.log("\n📋 Subscription Parameters (from feed registration):");
    if (feedIds.length > 0) {
      const feedId = feedIds[0];
      const config = await publicClient.readContract({
        address: reactorAddress as `0x${string}`,
        abi: abi,
        functionName: "getFeedConfig",
        args: [feedId],
      });

      console.log("   Chain ID:", config.originChainId.toString());
      console.log("   Contract:", config.feedAddress);
      console.log("   Event: AnswerUpdated");
      console.log(
        "   Topic 0: 0x0559884fd3a460db3073b7fc896cc77986f16e378210ded43186175bf646fc5f"
      );
      console.log("   Topics 1-3: REACTIVE_IGNORE (match any)");
      console.log("");

      console.log(
        "💡 These parameters should match what Reactive Network has registered."
      );
      console.log("   The subscribe() function was called with these values.");
      console.log("");
    }

    console.log("=".repeat(60));
    console.log("4️⃣  Reactscan Verification");
    console.log("=".repeat(60));
    console.log("\n🌐 Manual Check Required:");
    console.log(
      `   Visit: https://lasna.reactscan.io/address/${reactorAddress}`
    );
    console.log("   Click 'SUBSCRIPTION' tab");
    console.log("   Should show your subscription to Sepolia Chainlink feed");
    console.log("");

    console.log("=".repeat(60));
    console.log("📊 Summary");
    console.log("=".repeat(60));
    console.log("");

    if (systemContract !== "0x0000000000000000000000000000000000000000") {
      console.log("✅ System contract: Configured");
    } else {
      console.log("❌ System contract: Not set");
    }

    if (feedCount > 0n) {
      console.log(`✅ Feeds registered: ${feedCount}`);
    } else {
      console.log("❌ No feeds registered");
    }

    if (feedRegisteredEvents.length > 0) {
      console.log(`✅ FeedRegistered events: ${feedRegisteredEvents.length}`);
    } else {
      console.log("⚠️  No FeedRegistered events found");
    }

    console.log("");
    console.log("💡 Next Steps:");
    console.log("   1. Verify subscription appears on Reactscan");
    console.log("   2. Wait for Chainlink to emit AnswerUpdated event");
    console.log("   3. Monitor metrics for events received");
    console.log("");
  } catch (error: any) {
    console.error("❌ Error:", error.message);
    if (error.cause) {
      console.error("Cause:", error.cause);
    }
    process.exit(1);
  }
}

function formatTime(seconds: number): string {
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

main()
  .then(() => process.exit(0))
  .catch((error: any) => {
    console.error("❌ Error:", error);
    process.exit(1);
  });
