/**
 * Script to check if Chainlink is emitting events on the origin chain
 * This helps determine if the issue is with Chainlink or Reactive Network
 *
 * Usage:
 *   npx hardhat run scripts/check-origin-events.ts --network sepolia
 */

import { network } from "hardhat";
import { CONFIG } from "../frontend/src/config";
import { createPublicClient, http, defineChain } from "viem";

async function main() {
  console.log("🔍 Checking Chainlink Events on Origin Chain\n");
  console.log("=".repeat(60));

  // Define Sepolia chain
  const sepoliaChain = defineChain({
    id: 11155111,
    name: "Sepolia",
    nativeCurrency: {
      decimals: 18,
      name: "Ether",
      symbol: "ETH",
    },
    rpcUrls: {
      default: {
        http: [CONFIG.ORIGIN_CHAIN.rpcUrls[0]],
      },
    },
    blockExplorers: {
      default: {
        name: "Etherscan",
        url: CONFIG.ORIGIN_CHAIN.explorer,
      },
    },
  });

  // Try multiple RPC endpoints
  const rpcUrls = CONFIG.ORIGIN_CHAIN.rpcUrls || [
    CONFIG.ORIGIN_CHAIN.rpcUrl || "https://rpc.sepolia.org",
  ];
  let originClient: ReturnType<typeof createPublicClient> | null = null;
  let workingRpcUrl = "";

  for (const rpcUrl of rpcUrls) {
    try {
      console.log("🔌 Trying RPC:", rpcUrl);
      const testClient = createPublicClient({
        chain: sepoliaChain,
        transport: http(rpcUrl, { timeout: 10000 }),
      });
      await testClient.getBlockNumber(); // Test connection
      originClient = testClient;
      workingRpcUrl = rpcUrl;
      console.log("✅ Connected to:", rpcUrl);
      break;
    } catch (error: any) {
      console.log("   ❌ Failed:", error.message);
      continue;
    }
  }

  if (!originClient) {
    console.error("❌ Could not connect to any RPC endpoint");
    process.exit(1);
  }

  const feedAddress = CONFIG.ORIGIN_CHAIN.feedAddress as `0x${string}`;
  console.log("");
  console.log("📡 Origin Chain: Sepolia");
  console.log("🔗 Feed Address:", feedAddress);
  console.log("🌐 RPC URL:", workingRpcUrl);
  console.log("");

  // Chainlink's AnswerUpdated event signature
  // event AnswerUpdated(int256 indexed current, uint256 indexed roundId, uint256 updatedAt)
  const ANSWER_UPDATED_TOPIC_0 =
    "0x0559884fd3a460db3073b7fc896cc77986f16e378210ded43186175bf646fc5f";

  try {
    // Get current block
    const currentBlock = await originClient.getBlockNumber();
    console.log("📦 Current Block:", currentBlock.toString());

    // Check last 50000 blocks (roughly last week on Sepolia)
    const fromBlock = currentBlock - 50000n;
    console.log(
      "🔍 Checking blocks",
      fromBlock.toString(),
      "to",
      currentBlock.toString()
    );
    console.log("");

    // First, get the latest round data to find when it was updated
    const aggregatorAbi = [
      {
        inputs: [],
        name: "latestRoundData",
        outputs: [
          { name: "roundId", type: "uint80" },
          { name: "answer", type: "int256" },
          { name: "startedAt", type: "uint256" },
          { name: "updatedAt", type: "uint256" },
          { name: "answeredInRound", type: "uint80" },
        ],
        stateMutability: "view",
        type: "function",
      },
    ] as const;

    const roundData = await originClient.readContract({
      address: feedAddress,
      abi: aggregatorAbi,
      functionName: "latestRoundData",
    });

    const updatedAt = Number(roundData[3]);
    const timeSinceUpdate = Date.now() / 1000 - updatedAt;
    const blocksSinceUpdate = Math.floor(timeSinceUpdate / 12); // Sepolia ~12s blocks
    const estimatedBlockAtUpdate = currentBlock - BigInt(blocksSinceUpdate);

    // Check a smaller range around the estimated update time
    const searchFromBlock = estimatedBlockAtUpdate - 1000n;
    const searchToBlock = currentBlock;

    console.log(
      "🔍 Searching around estimated update block:",
      searchFromBlock.toString()
    );
    console.log("");

    // Get AnswerUpdated events using topic filter (more reliable)
    const ANSWER_UPDATED_TOPIC_0 =
      "0x0559884fd3a460db3073b7fc896cc77986f16e378210ded43186175bf646fc5f";

    const events = await originClient.getLogs({
      address: feedAddress,
      topics: [ANSWER_UPDATED_TOPIC_0],
      fromBlock: searchFromBlock,
      toBlock: searchToBlock,
    });

    console.log("📊 Results:");
    console.log("   Total AnswerUpdated Events:", events.length);
    console.log("");

    if (events.length === 0) {
      console.log("⚠️  No events found in the last 50000 blocks!");
      console.log("   This could mean:");
      console.log("   - Chainlink feed hasn't updated recently");
      console.log("   - The feed address is incorrect");
      console.log("   - The feed is inactive");
      console.log("");
      console.log("💡 Try:");
      console.log(
        "   1. Check the feed on Etherscan:",
        `${CONFIG.ORIGIN_CHAIN.explorer}/address/${feedAddress}`
      );
      console.log("   2. Verify the feed is active and updating");
      console.log("   3. Wait for the next price update");
    } else {
      console.log("✅ Chainlink is emitting events!");
      console.log("");

      // Show most recent events
      const recentEvents = events.slice(-5).reverse();
      console.log("📅 Most Recent Events:");
      for (const event of recentEvents) {
        const block = await originClient.getBlock({
          blockNumber: event.blockNumber,
        });
        const age = Number(currentBlock - event.blockNumber);
        const ageHours = (age * 12) / 3600; // Approximate (Sepolia ~12s blocks)

        console.log("");
        console.log("   Block:", event.blockNumber.toString());
        console.log("   Age: ~" + ageHours.toFixed(1) + " hours ago");
        console.log(
          "   Timestamp:",
          new Date(Number(block.timestamp) * 1000).toISOString()
        );
        console.log("   Transaction:", event.transactionHash);
        console.log("   Round ID:", event.args.roundId?.toString() || "N/A");
        console.log("   Price:", event.args.current?.toString() || "N/A");
      }

      const latestEvent = events[events.length - 1];
      const latestBlock = await originClient.getBlock({
        blockNumber: latestEvent.blockNumber,
      });
      const blocksSinceUpdate = Number(currentBlock - latestEvent.blockNumber);
      const hoursSinceUpdate = (blocksSinceUpdate * 12) / 3600;

      console.log("");
      console.log("⏰ Latest Update:");
      console.log("   Block:", latestEvent.blockNumber.toString());
      console.log("   ~" + hoursSinceUpdate.toFixed(1) + " hours ago");
      console.log("   Transaction:", latestEvent.transactionHash);
      console.log("");

      if (hoursSinceUpdate > 24) {
        console.log("⚠️  WARNING: Last update was more than 24 hours ago!");
        console.log(
          "   The feed might be inactive or updating very infrequently"
        );
      } else {
        console.log("✅ Feed is active and updating regularly");
        console.log("");
        console.log("💡 If Reactive Network isn't receiving these events:");
        console.log("   1. Check Reactive Network subscription status");
        console.log("   2. Verify the reactor is properly subscribed");
        console.log("   3. Contact Reactive Network support");
      }
    }

    // Also check the latest round data directly (already fetched above)
    console.log("");
    console.log("=".repeat(60));
    console.log("📈 Current Feed State:");
    console.log("=".repeat(60));

    try {
      const decimalsAbi = [
        {
          inputs: [],
          name: "decimals",
          outputs: [{ name: "", type: "uint8" }],
          stateMutability: "view",
          type: "function",
        },
      ] as const;

      const decimals = await originClient.readContract({
        address: feedAddress,
        abi: decimalsAbi,
        functionName: "decimals",
      });

      const price = Number(roundData[1]) / Math.pow(10, Number(decimals));
      const updatedAt = Number(roundData[3]);
      const timeSinceUpdate = Math.floor(Date.now() / 1000) - updatedAt;

      console.log("   Round ID:", roundData[0].toString());
      console.log("   Price: $", price.toFixed(2));
      console.log("   Updated At:", new Date(updatedAt * 1000).toISOString());
      console.log(
        "   Time Since Update:",
        Math.floor(timeSinceUpdate / 3600),
        "hours",
        Math.floor((timeSinceUpdate % 3600) / 60),
        "minutes"
      );
      console.log("");

      if (timeSinceUpdate > 86400) {
        console.log("⚠️  Feed data is stale (>24 hours old)");
      } else if (timeSinceUpdate > 3600) {
        console.log("⚠️  Feed data is somewhat stale (>1 hour old)");
      } else {
        console.log("✅ Feed data is fresh");
      }
    } catch (error: any) {
      console.log("   ❌ Could not read feed state:", error.message);
    }
  } catch (error: any) {
    console.error("❌ Error:", error.message);
    if (error.message.includes("rate limit") || error.message.includes("429")) {
      console.log("");
      console.log("💡 RPC rate limit hit. Try:");
      console.log("   1. Use a different RPC endpoint");
      console.log("   2. Wait a few minutes and try again");
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error: any) => {
    console.error("❌ Error:", error);
    process.exit(1);
  });
