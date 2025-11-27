import { createPublicClient, http, defineChain } from "viem";

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
      http: [
        "https://rpc.sepolia.org",
        "https://ethereum-sepolia-rpc.publicnode.com",
        "https://sepolia.gateway.tenderly.co",
      ],
    },
  },
  blockExplorers: {
    default: {
      name: "Etherscan",
      url: "https://sepolia.etherscan.io",
    },
  },
});

// Chainlink AnswerUpdated event signature
const ANSWER_UPDATED_TOPIC =
  "0x0559884fd3a460db3073b7fc896cc77986f16e378210ded43186175bf646fc5f";

async function main() {
  const feedAddress =
    process.env.FEED_ADDRESS || "0x694AA1769357215DE4FAC081bf1f309aDC325306"; // ETH/USD on Sepolia

  console.log("🔍 Checking Recent Chainlink Events on Sepolia\n");
  console.log("=".repeat(60));
  console.log("📝 Feed Address:", feedAddress);
  console.log("🌐 Network: Sepolia (11155111)");
  console.log("");

  // Try multiple RPC endpoints
  const rpcUrls = [
    "https://rpc.sepolia.org",
    "https://ethereum-sepolia-rpc.publicnode.com",
    "https://sepolia.gateway.tenderly.co",
  ];

  let publicClient: ReturnType<typeof createPublicClient> | null = null;
  let lastError: Error | null = null;

  // Try to connect to any RPC
  for (const rpcUrl of rpcUrls) {
    try {
      publicClient = createPublicClient({
        chain: sepoliaChain,
        transport: http(rpcUrl),
      });

      // Test connection
      await publicClient.getBlockNumber();
      console.log("✅ Connected to RPC:", rpcUrl);
      break;
    } catch (error: any) {
      console.log("❌ Failed to connect to:", rpcUrl);
      lastError = error;
      continue;
    }
  }

  if (!publicClient) {
    console.error("❌ Could not connect to any Sepolia RPC endpoint");
    if (lastError) {
      console.error("Last error:", lastError.message);
    }
    process.exit(1);
  }

  try {
    // Get current block
    const currentBlock = await publicClient.getBlockNumber();
    console.log("📦 Current Block:", currentBlock.toString());
    console.log("");

    // Check last 50,000 blocks (approximately last week)
    const fromBlock = currentBlock > 50000n ? currentBlock - 50000n : 0n;
    console.log(
      "🔍 Checking events from block",
      fromBlock.toString(),
      "to",
      currentBlock.toString()
    );
    console.log("   (Last ~50,000 blocks, approximately 1 week)");
    console.log("");

    // Get AnswerUpdated events using raw topic filter
    // AnswerUpdated(int256 indexed current, uint256 indexed roundId, uint256 updatedAt)
    const events = await publicClient.getLogs({
      address: feedAddress as `0x${string}`,
      topics: [
        ANSWER_UPDATED_TOPIC as `0x${string}`, // Event signature
      ],
      fromBlock: fromBlock,
      toBlock: currentBlock,
    });

    console.log("=".repeat(60));
    console.log("📊 Event Results");
    console.log("=".repeat(60));
    console.log(`✅ Found ${events.length} AnswerUpdated event(s)\n`);

    if (events.length === 0) {
      console.log("⚠️  No events found in the last ~10,000 blocks");
      console.log("");
      console.log("💡 This could mean:");
      console.log("   1. Chainlink hasn't updated this feed recently");
      console.log("   2. The feed address might be incorrect");
      console.log("   3. The feed might be paused or inactive");
      console.log("");
      console.log("🔍 Checking feed status...");

      // Try to read feed data to verify it's active
      try {
        const feedAbi = [
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
          {
            inputs: [],
            name: "updatedAt",
            outputs: [{ name: "", type: "uint256" }],
            stateMutability: "view",
            type: "function",
          },
        ] as const;

        const roundData = await publicClient.readContract({
          address: feedAddress as `0x${string}`,
          abi: feedAbi,
          functionName: "latestRoundData",
        });

        const [roundId, answer, startedAt, updatedAt] = roundData;
        const timeSinceUpdate =
          Math.floor(Date.now() / 1000) - Number(updatedAt);

        console.log("");
        console.log("📊 Feed Status:");
        console.log("   Round ID:", roundId.toString());
        console.log(
          "   Last Updated:",
          new Date(Number(updatedAt) * 1000).toISOString()
        );
        console.log("   Time Since Update:", formatTime(timeSinceUpdate));
        console.log("");

        if (timeSinceUpdate < 3600) {
          console.log("✅ Feed is active (updated within last hour)");
          console.log(
            "   Events might be in older blocks, or feed updates without emitting events"
          );
        } else if (timeSinceUpdate < 86400) {
          console.log("⚠️  Feed updated more than 1 hour ago");
        } else {
          console.log("❌ Feed hasn't updated in over 24 hours");
        }
      } catch (error: any) {
        console.log("⚠️  Could not read feed status:", error.message);
      }
    } else {
      // Show most recent events
      const recentEvents = events.slice(-5).reverse(); // Last 5, most recent first

      console.log("📅 Most Recent Events:");
      console.log("");

      for (const event of recentEvents) {
        const block = await publicClient.getBlock({
          blockNumber: event.blockNumber,
        });
        const timestamp = Number(block.timestamp) * 1000;
        const timeAgo = Math.floor((Date.now() - timestamp) / 1000);

        // Decode event data from raw log
        // topics[0] = event signature
        // topics[1] = current (int256, but stored as uint256 in topic)
        // topics[2] = roundId (uint256)
        // data = updatedAt (uint256)
        const current = BigInt(event.topics[1] || "0x0");
        const roundId = BigInt(event.topics[2] || "0x0");
        const updatedAt = event.data ? BigInt(event.data) : 0n;

        // Convert current from signed int (stored as uint in topic)
        const currentSigned =
          current > 2n ** 255n ? current - 2n ** 256n : current;
        const price = Number(currentSigned) / 1e8; // 8 decimals

        console.log("🔹 Event #" + (recentEvents.indexOf(event) + 1));
        console.log("   Block:", event.blockNumber.toString());
        console.log("   Transaction:", event.transactionHash);
        console.log("   Round ID:", roundId.toString());
        console.log(
          "   Price: $",
          price.toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })
        );
        console.log("   Timestamp:", new Date(timestamp).toISOString());
        console.log("   Time Ago:", formatTime(timeAgo));
        console.log("");
      }

      const latestEvent = events[events.length - 1];
      const latestBlock = await publicClient.getBlock({
        blockNumber: latestEvent.blockNumber,
      });
      const latestTimestamp = Number(latestBlock.timestamp) * 1000;
      const latestTimeAgo = Math.floor((Date.now() - latestTimestamp) / 1000);

      console.log("=".repeat(60));
      console.log("📊 Summary");
      console.log("=".repeat(60));
      console.log("   Total Events Found:", events.length);
      console.log("   Latest Event Block:", latestEvent.blockNumber.toString());
      console.log(
        "   Latest Event Price: $",
        latestPrice.toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })
      );
      console.log(
        "   Latest Event Time:",
        new Date(latestTimestamp).toISOString()
      );
      console.log("   Time Since Last Event:", formatTime(latestTimeAgo));
      console.log("");

      if (latestTimeAgo < 3600) {
        console.log("✅ Chainlink is actively emitting events!");
        console.log("   If your reactor isn't receiving them, check:");
        console.log("   1. Subscription is active on Reactscan");
        console.log("   2. Reactive Network is monitoring Sepolia");
        console.log("   3. System contract subscription was successful");
      } else if (latestTimeAgo < 86400) {
        console.log("⚠️  Last event was more than 1 hour ago");
        console.log("   Chainlink may update infrequently for this feed");
      } else {
        console.log("❌ Last event was more than 24 hours ago");
        console.log("   This feed may be inactive or paused");
      }
    }

    console.log("");
    console.log("🔗 View Feed on Etherscan:");
    console.log(`   https://sepolia.etherscan.io/address/${feedAddress}`);
    console.log("");
  } catch (error: any) {
    console.error("❌ Error checking events:");
    console.error(error.message);
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
