/**
 * Script to verify Reactive Network subscription status
 *
 * This script checks:
 * 1. Feed registration event (FeedRegistered)
 * 2. Subscription parameters
 * 3. Reactive Network explorer links
 * 4. Recent react() calls (if any)
 *
 * Usage:
 *   npx hardhat run scripts/verify-subscription.ts --network reactive
 */

import { network } from "hardhat";
import { getAddress, keccak256, encodePacked, http, createPublicClient, getContract } from "viem";
import { defineChain } from "viem";
import { CONFIG } from "../frontend/src/config";
import * as fs from "fs";
import * as path from "path";

// Define Reactive Network testnet chain
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
      http: [process.env.REACTIVE_TESTNET_RPC_URL || "https://lasna-rpc.rnk.dev"],
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
  console.log("🔍 Reactive Network Subscription Verification\n");
  console.log("=".repeat(60));

  // Create public client for Reactive Network
  const reactiveRpcUrl = process.env.REACTIVE_TESTNET_RPC_URL || "https://lasna-rpc.rnk.dev";
  const reactivePublicClient = createPublicClient({
    chain: reactiveTestnetChain,
    transport: http(reactiveRpcUrl),
  });

  const reactorAddress = CONFIG.REACTIVE_NETWORK.reactorAddress as `0x${string}`;
  const originFeedAddress = CONFIG.ORIGIN_CHAIN.feedAddress as `0x${string}`;
  const originChainId = BigInt(CONFIG.ORIGIN_CHAIN.chainId);

  console.log("📡 Network: Reactive Network (Lasna Testnet)");
  console.log("🔗 Reactor Address:", reactorAddress);
  console.log("🌐 RPC URL:", reactiveRpcUrl);
  console.log("");

  // Load reactor ABI
  let reactorAbi: any[] = [];
  try {
    const artifactPath = path.join(
      process.cwd(),
      "artifacts/contracts/reactive/ChainlinkFeedReactor.sol/ChainlinkFeedReactor.json"
    );
    const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf-8"));
    reactorAbi = artifact.abi;
  } catch (error: any) {
    console.error("❌ Could not load reactor ABI:", error.message);
    process.exit(1);
  }

  const reactor = getContract({
    address: reactorAddress,
    abi: reactorAbi,
    client: { public: reactivePublicClient },
  });

  // Calculate feed ID
  const feedId = keccak256(
    encodePacked(
      ["uint64", "address"],
      [originChainId, getAddress(originFeedAddress)]
    )
  );

  console.log("=".repeat(60));
  console.log("1️⃣  Checking Feed Registration");
  console.log("=".repeat(60));

  try {
    const feedConfig = await reactor.read.getFeedConfig([feedId]);
    console.log("✅ Feed is registered!");
    console.log("");
    console.log("📋 Registration Details:");
    console.log("   Feed ID:", feedId);
    console.log("   Origin Chain ID:", feedConfig.originChainId.toString());
    console.log("   Feed Address:", feedConfig.feedAddress);
    console.log("   Destination Chain ID:", feedConfig.destinationChainId.toString());
    console.log("   Destination Proxy:", feedConfig.destinationProxy);
    console.log("   Active:", feedConfig.active);
    console.log("   Description:", feedConfig.description);
    console.log("");

    // Check metrics
    const metrics = await reactor.read.getFeedMetrics([feedId]);
    console.log("📊 Metrics:");
    console.log("   Total Events Received:", metrics.totalEventsReceived.toString());
    console.log("   Updates Forwarded:", metrics.updatesForwarded.toString());
    console.log("   Updates Skipped:", metrics.updatesSkipped.toString());
    console.log("");

    if (metrics.totalEventsReceived === 0n) {
      console.log("⚠️  WARNING: No events received yet!");
    } else {
      console.log("✅ Events are being received!");
    }
  } catch (error: any) {
    console.log("❌ Feed is NOT registered!");
    console.log("   Error:", error.message);
    console.log("\n   💡 Run register-feed.ts to register the feed");
    process.exit(1);
  }

  console.log("=".repeat(60));
  console.log("2️⃣  Checking FeedRegistered Event");
  console.log("=".repeat(60));

  try {
    const currentBlock = await reactivePublicClient.getBlockNumber();
    const fromBlock = currentBlock - 100000n; // Last ~100k blocks

    const feedRegisteredEvents = await reactivePublicClient.getLogs({
      address: reactorAddress,
      event: reactorAbi.find((e: any) => e.name === "FeedRegistered") as any,
      fromBlock,
      toBlock: currentBlock,
    });

    if (feedRegisteredEvents.length > 0) {
      const registrationEvent = feedRegisteredEvents.find(
        (e: any) => e.args.feedId?.toLowerCase() === feedId.toLowerCase()
      ) || feedRegisteredEvents[feedRegisteredEvents.length - 1];

      if (registrationEvent) {
        const block = await reactivePublicClient.getBlock({
          blockNumber: registrationEvent.blockNumber,
        });

        console.log("✅ FeedRegistered event found!");
        console.log("");
        console.log("📅 Registration Details:");
        console.log("   Block:", registrationEvent.blockNumber.toString());
        console.log("   Transaction:", registrationEvent.transactionHash);
        console.log("   Timestamp:", new Date(Number(block.timestamp) * 1000).toISOString());
        console.log("   Origin Chain ID:", registrationEvent.args.originChainId?.toString() || "N/A");
        console.log("   Feed Address:", registrationEvent.args.feedAddress || "N/A");
        console.log("   Destination Chain ID:", registrationEvent.args.destinationChainId?.toString() || "N/A");
        console.log("   Destination Proxy:", registrationEvent.args.destinationProxy || "N/A");
        console.log("");

        // Calculate age
        const age = Number(currentBlock - registrationEvent.blockNumber);
        const ageHours = (age * 12) / 3600; // Approximate
        console.log("   Age: ~" + ageHours.toFixed(1) + " hours ago");
      } else {
        console.log("⚠️  FeedRegistered event not found for this feed ID");
      }
    } else {
      console.log("⚠️  No FeedRegistered events found");
      console.log("   This might mean the feed was registered before the search range");
    }
  } catch (error: any) {
    console.log("⚠️  Error checking events:", error.message);
  }

  console.log("");
  console.log("=".repeat(60));
  console.log("3️⃣  Subscription Parameters");
  console.log("=".repeat(60));

  // Chainlink's AnswerUpdated event signature
  const ANSWER_UPDATED_TOPIC_0 = "0x0559884fd3a460db3073b7fc896cc77986f16e378210ded43186175bf646fc5f";
  const REACTIVE_IGNORE = "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";

  console.log("📋 Expected Subscription Parameters:");
  console.log("   Chain ID:", originChainId.toString(), "(Sepolia)");
  console.log("   Contract Address:", originFeedAddress);
  console.log("   Event Signature (Topic 0):", ANSWER_UPDATED_TOPIC_0);
  console.log("   Topic 1 Filter:", REACTIVE_IGNORE, "(ignore - match any)");
  console.log("   Topic 2 Filter:", REACTIVE_IGNORE, "(ignore - match any)");
  console.log("   Topic 3 Filter:", REACTIVE_IGNORE, "(ignore - match any)");
  console.log("");
  console.log("💡 These parameters should match what Reactive Network has registered");
  console.log("   The subscribe() function was called with these values during feed registration");

  console.log("");
  console.log("=".repeat(60));
  console.log("4️⃣  Checking for react() Calls");
  console.log("=".repeat(60));

  try {
    const currentBlock = await reactivePublicClient.getBlockNumber();
    const fromBlock = currentBlock - 10000n;

    // Check for any transactions to the reactor (might be react() calls)
    // Note: react() calls might not emit events, so we check transaction logs
    const allLogs = await reactivePublicClient.getLogs({
      address: reactorAddress,
      fromBlock,
      toBlock: currentBlock,
    });

    const updateForwardedEvents = allLogs.filter(
      (log: any) => log.topics[0]?.toLowerCase() === 
        reactorAbi.find((e: any) => e.name === "UpdateForwarded")?.hash?.toLowerCase()
    );

    const updateSkippedEvents = allLogs.filter(
      (log: any) => log.topics[0]?.toLowerCase() === 
        reactorAbi.find((e: any) => e.name === "UpdateSkipped")?.hash?.toLowerCase()
    );

    console.log("📊 Recent Activity (last 10000 blocks):");
    console.log("   UpdateForwarded Events:", updateForwardedEvents.length);
    console.log("   UpdateSkipped Events:", updateSkippedEvents.length);
    console.log("");

    if (updateForwardedEvents.length > 0 || updateSkippedEvents.length > 0) {
      console.log("✅ react() function IS being called!");
      console.log("   Reactive Network is delivering events to your reactor");
    } else {
      console.log("⚠️  No react() activity detected");
      console.log("   This suggests Reactive Network is not calling react()");
      console.log("   Possible reasons:");
      console.log("   - Subscription is not active");
      console.log("   - No Chainlink events have fired since registration");
      console.log("   - Reactive Network infrastructure issue");
    }
  } catch (error: any) {
    console.log("⚠️  Error checking activity:", error.message);
  }

  console.log("");
  console.log("=".repeat(60));
  console.log("5️⃣  Manual Verification Steps");
  console.log("=".repeat(60));

  const explorerUrl = CONFIG.REACTIVE_NETWORK.explorer;
  console.log("🌐 Reactive Network Explorer:");
  console.log("   Contract:", `${explorerUrl}/address/${reactorAddress}`);
  console.log("");
  console.log("📝 Steps to verify subscription:");
  console.log("");
  console.log("1. Visit the reactor contract on Reactscan:");
  console.log(`   ${explorerUrl}/address/${reactorAddress}`);
  console.log("");
  console.log("2. Check the 'Events' tab for:");
  console.log("   - FeedRegistered events");
  console.log("   - UpdateForwarded events (if events are being processed)");
  console.log("   - UpdateSkipped events (if events are being filtered)");
  console.log("");
  console.log("3. Check the 'Read Contract' tab:");
  console.log("   - Call getFeedConfig() with feed ID:", feedId);
  console.log("   - Call getFeedMetrics() to see event counts");
  console.log("");
  console.log("4. Check transaction history:");
  console.log("   - Look for transactions that called react()");
  console.log("   - These should come from Reactive Network's VM");
  console.log("");
  console.log("5. Verify on origin chain (Sepolia):");
  console.log("   - Check if Chainlink is emitting AnswerUpdated events");
  console.log("   - Run: npx hardhat run scripts/check-origin-events.ts --network sepolia");
  console.log("");

  console.log("=".repeat(60));
  console.log("6️⃣  Subscription Status Summary");
  console.log("=".repeat(60));

  const metrics = await reactor.read.getFeedMetrics([feedId]);
  const feedConfig = await reactor.read.getFeedConfig([feedId]);

  console.log("");
  if (metrics.totalEventsReceived > 0n) {
    console.log("✅ SUBSCRIPTION IS ACTIVE");
    console.log("   Events are being received and processed");
  } else if (feedConfig.active) {
    console.log("⚠️  SUBSCRIPTION STATUS: UNKNOWN");
    console.log("   Feed is registered but no events received yet");
    console.log("   Possible reasons:");
    console.log("   1. No Chainlink events since registration");
    console.log("   2. Subscription not yet activated by Reactive Network");
    console.log("   3. Reactive Network infrastructure delay");
    console.log("");
    console.log("   💡 Next steps:");
    console.log("   1. Wait for next Chainlink price update");
    console.log("   2. Check Reactive Network status/dashboard");
    console.log("   3. Contact Reactive Network support if issue persists");
  } else {
    console.log("❌ SUBSCRIPTION IS INACTIVE");
    console.log("   Feed is registered but marked as inactive");
    console.log("   Run setFeedActive() to activate the feed");
  }

  console.log("");
}

main()
  .then(() => process.exit(0))
  .catch((error: any) => {
    console.error("❌ Error:", error);
    process.exit(1);
  });

