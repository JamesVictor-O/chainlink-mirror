/**
 * Comprehensive diagnostic script for FeedProxy issues
 * Checks authorization, failed transactions, and contract state
 */

import { createPublicClient, http, defineChain } from "viem";
import * as fs from "fs";
import * as path from "path";

const bnbTestnetChain = defineChain({
  id: 97,
  name: "BNB Smart Chain Testnet",
  nativeCurrency: {
    decimals: 18,
    name: "BNB",
    symbol: "BNB",
  },
  rpcUrls: {
    default: {
      http: [
        process.env.BNB_TESTNET_RPC_URL ||
          "https://bsc-testnet.publicnode.com",
      ],
    },
  },
  blockExplorers: {
    default: {
      name: "BscScan",
      url: "https://testnet.bscscan.com",
    },
  },
});

async function main() {
  const feedProxyAddress =
    process.env.FEEDPROXY_ADDRESS ||
    "0xC71C22d41dbB39083B219e89A755E4Df55931A60";

  console.log("🔍 Comprehensive FeedProxy Diagnostic\n");
  console.log("=".repeat(60));
  console.log("📝 FeedProxy Address:", feedProxyAddress);
  console.log("🌐 Network: BNB Smart Chain Testnet (97)");
  console.log("");

  const publicClient = createPublicClient({
    chain: bnbTestnetChain,
    transport: http(
      process.env.BNB_TESTNET_RPC_URL || "https://bsc-testnet.publicnode.com"
    ),
  });

  // Load FeedProxy ABI
  const abiPath = path.join(
    process.cwd(),
    "frontend/src/abis/FeedProxy.json"
  );
  const abi = JSON.parse(fs.readFileSync(abiPath, "utf-8")).abi;

  try {
    console.log("=".repeat(60));
    console.log("1️⃣  Contract State");
    console.log("=".repeat(60));

    // Check if contract exists
    const code = await publicClient.getBytecode({
      address: feedProxyAddress as `0x${string}`,
    });
    if (!code || code === "0x") {
      console.log("❌ Contract not found at this address!");
      return;
    }
    console.log("✅ Contract exists");

    // Check owner
    const owner = await publicClient.readContract({
      address: feedProxyAddress as `0x${string}`,
      abi: abi,
      functionName: "owner",
    });
    console.log("👑 Owner:", owner);

    // Check if paused
    const paused = await publicClient.readContract({
      address: feedProxyAddress as `0x${string}`,
      abi: abi,
      functionName: "paused",
    });
    console.log("⏸️  Paused:", paused ? "Yes ❌" : "No ✅");

    // Check authorized senders
    const reactorAddress = "0xbb0043babcc6be0a6c72415ee8e6221812534311";
    const isReactorAuthorized = await publicClient.readContract({
      address: feedProxyAddress as `0x${string}`,
      abi: abi,
      functionName: "authorizedSenders",
      args: [reactorAddress as `0x${string}`],
    });
    console.log(
      `🔐 Reactor authorized: ${isReactorAuthorized ? "Yes ✅" : "No ❌"}`
    );
    console.log("   Reactor Address:", reactorAddress);

    // Check health
    const healthCheck = await publicClient.readContract({
      address: feedProxyAddress as `0x${string}`,
      abi: abi,
      functionName: "healthCheck",
    });
    const [isHealthy, secondsSinceUpdate, isPaused] = healthCheck as [
      boolean,
      bigint,
      boolean
    ];
    console.log("💚 Health Status:", isHealthy ? "Healthy ✅" : "Unhealthy ❌");
    console.log(
      "   Time Since Update:",
      secondsSinceUpdate === BigInt(2 ** 256 - 1)
        ? "Never"
        : formatTime(Number(secondsSinceUpdate))
    );

    // Try to get latest round data
    console.log("\n📊 Latest Round Data:");
    try {
      const roundData = await publicClient.readContract({
        address: feedProxyAddress as `0x${string}`,
        abi: abi,
        functionName: "latestRoundData",
      });
      const [roundId, answer, startedAt, updatedAt, answeredInRound] =
        roundData as [bigint, bigint, bigint, bigint, bigint];
      const decimals = await publicClient.readContract({
        address: feedProxyAddress as `0x${string}`,
        abi: abi,
        functionName: "decimals",
      });
      const price = Number(answer) / Math.pow(10, Number(decimals));
      const timeSince = Math.floor(Date.now() / 1000) - Number(updatedAt);

      console.log("   ✅ Data Available:");
      console.log("   Round ID:", roundId.toString());
      console.log("   Price: $", price.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }));
      console.log("   Updated At:", new Date(Number(updatedAt) * 1000).toISOString());
      console.log("   Time Since Update:", formatTime(timeSince));
    } catch (error: any) {
      if (error.message?.includes("NoDataAvailable")) {
        console.log("   ❌ No data available - FeedProxy has never been updated");
      } else {
        console.log("   ❌ Error:", error.message);
      }
    }

    // Check total updates
    const totalUpdates = await publicClient.readContract({
      address: feedProxyAddress as `0x${string}`,
      abi: abi,
      functionName: "totalUpdates",
    });
    console.log("\n📈 Total Updates:", totalUpdates.toString());

    console.log("\n" + "=".repeat(60));
    console.log("2️⃣  Recent Transactions");
    console.log("=".repeat(60));

    // Check for AnswerUpdated events (indicates successful updates)
    const currentBlock = await publicClient.getBlockNumber();
    const fromBlock = currentBlock > 50000n ? currentBlock - 50000n : 0n;

    const answerUpdatedEvents = await publicClient.getLogs({
      address: feedProxyAddress as `0x${string}`,
      event: {
        type: "event",
        name: "AnswerUpdated",
        inputs: [
          { type: "int256", indexed: true, name: "current" },
          { type: "uint256", indexed: true, name: "roundId" },
          { type: "uint256", indexed: false, name: "updatedAt" },
        ],
      },
      fromBlock: fromBlock,
      toBlock: currentBlock,
    });

    console.log(
      `📊 AnswerUpdated Events: ${answerUpdatedEvents.length} (last 50k blocks)`
    );

    if (answerUpdatedEvents.length > 0) {
      const latest = answerUpdatedEvents[answerUpdatedEvents.length - 1];
      const block = await publicClient.getBlock({
        blockNumber: latest.blockNumber,
      });
      const timeAgo = Math.floor(
        (Date.now() - Number(block.timestamp) * 1000) / 1000
      );
      console.log("   Latest Event:", formatTime(timeAgo), "ago");
      console.log("   Block:", latest.blockNumber.toString());
      console.log("   Transaction:", latest.transactionHash);
    } else {
      console.log("   ⚠️  No AnswerUpdated events found");
      console.log("   This means FeedProxy has never received an update");
    }

    console.log("\n" + "=".repeat(60));
    console.log("3️⃣  Diagnosis");
    console.log("=".repeat(60));

    console.log("\n🔍 Root Cause Analysis:\n");

    if (totalUpdates === 0n) {
      console.log("❌ FeedProxy has NEVER received an update");
      console.log("   - totalUpdates = 0");
      console.log("   - No AnswerUpdated events");
      console.log("");
      console.log("💡 This means:");
      console.log("   1. Reactor hasn't forwarded any updates");
      console.log("   2. Reactor hasn't received Chainlink events (we know this)");
      console.log("   3. Chainlink on Sepolia isn't emitting AnswerUpdated events");
    } else {
      console.log(`✅ FeedProxy has received ${totalUpdates} update(s)`);
      console.log("   But data might be stale");
    }

    if (!isReactorAuthorized) {
      console.log("\n⚠️  IMPORTANT: Reactor is NOT authorized!");
      console.log("   Even if reactor tries to update, it will fail");
      console.log("   Solution: Authorize the reactor address");
      console.log("   OR authorize the Reactive Network bridge/router address");
    }

    if (paused) {
      console.log("\n⚠️  FeedProxy is PAUSED!");
      console.log("   Updates cannot be processed");
      console.log("   Solution: Unpause the contract");
    }

    console.log("\n" + "=".repeat(60));
    console.log("4️⃣  Solutions");
    console.log("=".repeat(60));

    console.log("\nTo fix the issue:\n");

    if (!isReactorAuthorized) {
      console.log("1. Authorize sender:");
      console.log("   Option A: Authorize reactor address (if Reactive Network uses it directly)");
      console.log("   Option B: Find Reactive Network bridge/router address and authorize it");
      console.log("   Run: npx hardhat run scripts/add-authorized-sender.ts --network bnbTestnet");
      console.log("");
    }

    console.log("2. Wait for Chainlink to emit AnswerUpdated event:");
    console.log("   - Chainlink on Sepolia is active but not emitting events");
    console.log("   - This is normal for testnet feeds");
    console.log("   - Once event is emitted, reactor will process it automatically");
    console.log("");

    console.log("3. Monitor reactor metrics:");
    console.log("   npx hardhat run scripts/verify-subscription.ts --network reactive");
    console.log("   Look for 'Total Events Received > 0'");
    console.log("");

    console.log("🔗 View FeedProxy on BscScan:");
    console.log(
      `   https://testnet.bscscan.com/address/${feedProxyAddress}`
    );
    console.log("");
  } catch (error: any) {
    console.error("❌ Error:", error.message);
    if (error.cause) {
      console.error("Cause:", error.cause);
    }
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

