/**
 * Script to find active Chainlink feeds on Sepolia that emit AnswerUpdated events
 * Helps identify feeds that are more likely to emit events frequently
 */

import { createPublicClient, http, defineChain } from "viem";

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
      http: ["https://ethereum-sepolia-rpc.publicnode.com"],
    },
  },
});

const ANSWER_UPDATED_TOPIC = 
  "0x0559884fd3a460db3073b7fc896cc77986f16e378210ded43186175bf646fc5f";

// Known Chainlink feed addresses on Sepolia (test/mock feeds)
const KNOWN_FEEDS = [
  {
    address: "0x694AA1769357215DE4FAC081bf1f309aDC325306",
    name: "ETH/USD",
    description: "Ethereum / US Dollar",
  },
  {
    address: "0x1b44F3514812e835E1D0044C4e5a7a5b6042cd33",
    name: "BTC/USD",
    description: "Bitcoin / US Dollar",
  },
  {
    address: "0x4aDC67696bA383F43DD60A9e78F2C97Fbbfc7cb1",
    name: "LINK/USD",
    description: "Chainlink / US Dollar",
  },
];

async function checkFeed(publicClient: ReturnType<typeof createPublicClient>, feed: typeof KNOWN_FEEDS[0]) {
  try {
    // Check if contract exists
    const code = await publicClient.getBytecode({ 
      address: feed.address as `0x${string}` 
    });
    
    if (!code || code === "0x") {
      return null;
    }

    // Get current block
    const currentBlock = await publicClient.getBlockNumber();
    // Use smaller range to avoid RPC limits (check last 10k blocks)
    const fromBlock = currentBlock > 10000n ? currentBlock - 10000n : 0n;

    // Check for events in last 10k blocks
    let events: any[] = [];
    try {
      events = await publicClient.getLogs({
        address: feed.address as `0x${string}`,
        topics: [ANSWER_UPDATED_TOPIC as `0x${string}`],
        fromBlock: fromBlock,
        toBlock: currentBlock,
      });
    } catch (error: any) {
      // If range too large, try smaller
      if (error.message?.includes("maximum block range")) {
        const smallerFromBlock = currentBlock > 5000n ? currentBlock - 5000n : 0n;
        try {
          events = await publicClient.getLogs({
            address: feed.address as `0x${string}`,
            topics: [ANSWER_UPDATED_TOPIC as `0x${string}`],
            fromBlock: smallerFromBlock,
            toBlock: currentBlock,
          });
        } catch (e) {
          // Ignore
        }
      }
    }

    // Get latest round data
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
        name: "description",
        outputs: [{ name: "", type: "string" }],
        stateMutability: "view",
        type: "function",
      },
    ] as const;

    let roundData: any = null;
    let description = feed.description;
    try {
      roundData = await publicClient.readContract({
        address: feed.address as `0x${string}`,
        abi: feedAbi,
        functionName: "latestRoundData",
      });
      description = await publicClient.readContract({
        address: feed.address as `0x${string}`,
        abi: feedAbi,
        functionName: "description",
      });
    } catch (e) {
      // Ignore
    }

    const timeSinceUpdate = roundData 
      ? Math.floor(Date.now() / 1000) - Number(roundData[3])
      : null;

    return {
      ...feed,
      description,
      eventsFound: events.length,
      latestEvent: events.length > 0 ? events[events.length - 1] : null,
      roundData,
      timeSinceUpdate,
      isActive: timeSinceUpdate !== null && timeSinceUpdate < 86400,
    };
  } catch (error: any) {
    console.error(`Error checking ${feed.name}:`, error.message);
    return null;
  }
}

async function main() {
  console.log("🔍 Finding Active Chainlink Feeds on Sepolia\n");
  console.log("=".repeat(60));

  const publicClient = createPublicClient({
    chain: sepoliaChain,
    transport: http("https://ethereum-sepolia-rpc.publicnode.com"),
  });

  const results = [];
  for (const feed of KNOWN_FEEDS) {
    console.log(`Checking ${feed.name}...`);
    const result = await checkFeed(publicClient, feed);
    if (result) {
      results.push(result);
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log("📊 Results");
  console.log("=".repeat(60) + "\n");

  if (results.length === 0) {
    console.log("❌ No active feeds found");
    return;
  }

  // Sort by events found (most active first)
  results.sort((a, b) => b.eventsFound - a.eventsFound);

  for (const feed of results) {
    console.log(`📊 ${feed.name} (${feed.description})`);
    console.log(`   Address: ${feed.address}`);
    console.log(`   Events Found (last 100k blocks): ${feed.eventsFound}`);
    
    if (feed.timeSinceUpdate !== null) {
      console.log(`   Last Update: ${formatTime(feed.timeSinceUpdate)}`);
      if (feed.roundData) {
        const price = Number(feed.roundData[1]) / 1e8;
        console.log(`   Current Price: $${price.toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`);
      }
    }

    if (feed.eventsFound > 0 && feed.latestEvent) {
      const block = await publicClient.getBlock({ 
        blockNumber: feed.latestEvent.blockNumber 
      });
      const timeAgo = Math.floor((Date.now() - Number(block.timestamp) * 1000) / 1000);
      console.log(`   Last Event: ${formatTime(timeAgo)} ago`);
      console.log(`   ✅ This feed emits events!`);
    } else {
      console.log(`   ⚠️  No events found (may not emit AnswerUpdated)`);
    }
    
    console.log("");
  }

  // Recommendation
  const activeFeeds = results.filter(f => f.eventsFound > 0);
  if (activeFeeds.length > 0) {
    console.log("=".repeat(60));
    console.log("💡 Recommendation");
    console.log("=".repeat(60));
    console.log(`✅ Found ${activeFeeds.length} feed(s) that emit events:`);
    activeFeeds.forEach(f => {
      console.log(`   - ${f.name}: ${f.address}`);
    });
    console.log("\nConsider registering one of these feeds for testing!");
  } else {
    console.log("=".repeat(60));
    console.log("⚠️  No feeds found that emit AnswerUpdated events");
    console.log("=".repeat(60));
    console.log("\nThis is common on testnets - feeds may update without emitting events.");
    console.log("Your reactor subscription is correct, just waiting for an event.");
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

