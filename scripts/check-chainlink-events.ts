/**
 * Check when the last Chainlink AnswerUpdated event was emitted on Sepolia
 */

import { createPublicClient, http, defineChain } from "viem";
import { ethers } from "ethers";

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
        "https://ethereum-sepolia-rpc.publicnode.com",
        "https://rpc.sepolia.org",
      ],
    },
  },
});

async function main() {
  const chainlinkFeedAddress = "0x694AA1769357215DE4FAC081bf1f309aDC325306";

  console.log("🔍 Checking Chainlink Events on Sepolia");
  console.log("=======================================");
  console.log("");
  console.log("Feed Address:", chainlinkFeedAddress);
  console.log("");

  const sepoliaClient = createPublicClient({
    chain: sepoliaChain,
    transport: http("https://ethereum-sepolia-rpc.publicnode.com"),
  });

  // Get current block
  const currentBlock = await sepoliaClient.getBlockNumber();
  console.log("Current Block:", currentBlock.toString());
  console.log("");

  // Check last 10,000 blocks (roughly 1.5 days)
  const fromBlock = currentBlock > 10000n ? currentBlock - 10000n : 0n;
  console.log(`Checking blocks ${fromBlock} to ${currentBlock}...`);
  console.log("");

  try {
    const recentEvents = await sepoliaClient.getLogs({
      address: chainlinkFeedAddress as `0x${string}`,
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

    console.log(`✅ Found ${recentEvents.length} AnswerUpdated events`);
    console.log("");

    if (recentEvents.length > 0) {
      // Get block details for the latest event
      const latestEvent = recentEvents[recentEvents.length - 1];
      const block = await sepoliaClient.getBlock({
        blockNumber: latestEvent.blockNumber,
      });
      const timestamp = Number(block.timestamp) * 1000;
      const timeAgo = Math.floor((Date.now() - timestamp) / 1000);
      const minutesAgo = Math.floor(timeAgo / 60);
      const hoursAgo = Math.floor(timeAgo / 3600);

      console.log("📊 Latest Event Details:");
      console.log("   Block Number:", latestEvent.blockNumber.toString());
      console.log("   Block Timestamp:", new Date(timestamp).toISOString());
      console.log(
        "   Time Ago:",
        `${hoursAgo}h ${Math.floor((timeAgo % 3600) / 60)}m ${timeAgo % 60}s`
      );
      console.log(
        "   Round ID:",
        latestEvent.args.roundId?.toString() || "N/A"
      );
      console.log("   Price:", latestEvent.args.current?.toString() || "N/A");
      console.log(
        "   Updated At:",
        latestEvent.args.updatedAt?.toString() || "N/A"
      );
      console.log("");

      // Show last 5 events
      console.log("📋 Last 5 Events:");
      const lastFive = recentEvents.slice(-5).reverse();
      for (let i = 0; i < lastFive.length; i++) {
        const event = lastFive[i];
        const eventBlock = await sepoliaClient.getBlock({
          blockNumber: event.blockNumber,
        });
        const eventTime = Number(eventBlock.timestamp) * 1000;
        const eventTimeAgo = Math.floor((Date.now() - eventTime) / 1000);
        const eventHoursAgo = Math.floor(eventTimeAgo / 3600);
        const eventMinutesAgo = Math.floor((eventTimeAgo % 3600) / 60);

        console.log(
          `   ${
            i + 1
          }. Block ${event.blockNumber.toString()}: ${eventHoursAgo}h ${eventMinutesAgo}m ago`
        );
        console.log(
          `      Round ID: ${event.args.roundId?.toString() || "N/A"}`
        );
        console.log(`      Price: ${event.args.current?.toString() || "N/A"}`);
      }
      console.log("");

      if (timeAgo > 3600) {
        console.log("⚠️  WARNING: Last event was more than 1 hour ago!");
        console.log(
          "   Chainlink might not be updating frequently on Sepolia testnet."
        );
        console.log(
          "   This could explain why Reactive Network hasn't processed any events."
        );
      } else {
        console.log("✅ Chainlink is updating regularly");
        console.log(
          "   If Reactive Network isn't processing these, the issue is with Reactive Network."
        );
      }
    } else {
      console.log("❌ NO events found in last 10,000 blocks!");
      console.log(
        "   This means Chainlink hasn't updated in a very long time."
      );
      console.log(
        "   This is likely why Reactive Network hasn't called react()."
      );
    }
  } catch (error: any) {
    console.error("❌ Error checking events:", error.message);
    console.error(error);
  }

  // Also check latest round data directly
  console.log("");
  console.log("📡 Checking Latest Round Data Directly:");
  console.log("=======================================");
  try {
    const chainlinkContract = new ethers.Contract(
      chainlinkFeedAddress,
      [
        "function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)",
      ],
      new ethers.JsonRpcProvider("https://ethereum-sepolia-rpc.publicnode.com")
    );

    const [roundId, answer, startedAt, updatedAt, answeredInRound] =
      await chainlinkContract.latestRoundData();

    const timeSinceUpdate = Math.floor(Date.now() / 1000) - Number(updatedAt);
    const hoursSinceUpdate = Math.floor(timeSinceUpdate / 3600);
    const minutesSinceUpdate = Math.floor((timeSinceUpdate % 3600) / 60);

    console.log("   Round ID:", roundId.toString());
    console.log("   Price:", answer.toString());
    console.log(
      "   Updated At:",
      new Date(Number(updatedAt) * 1000).toISOString()
    );
    console.log(
      "   Time Since Update:",
      `${hoursSinceUpdate}h ${minutesSinceUpdate}m`
    );
    console.log("");

    if (timeSinceUpdate > 3600) {
      console.log("⚠️  Chainlink feed hasn't updated in over 1 hour!");
    }
  } catch (error: any) {
    console.error("❌ Error checking latest round data:", error.message);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Error:", error);
    process.exit(1);
  });
