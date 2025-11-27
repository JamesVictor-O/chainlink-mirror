/**
 * Test script to manually call react() function to verify it works
 * This helps us determine if the issue is with the function itself or Reactive Network not calling it
 */

import { createPublicClient, http, createWalletClient, getAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { defineChain } from "viem";
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
});

async function main() {
  const reactorAddress = process.env.REACTOR_ADDRESS;
  if (!reactorAddress) {
    console.error("❌ REACTOR_ADDRESS not set");
    process.exit(1);
  }

  const privateKey = process.env.REACTIVE_PRIVATE_KEY;
  if (!privateKey) {
    console.error("❌ REACTIVE_PRIVATE_KEY not set");
    process.exit(1);
  }

  const rpcUrl =
    process.env.REACTIVE_TESTNET_RPC_URL || "https://lasna-rpc.rnk.dev";

  const account = privateKeyToAccount(
    `0x${privateKey.replace(/^0x/, "")}` as `0x${string}`
  );
  const publicClient = createPublicClient({
    chain: reactiveTestnetChain,
    transport: http(rpcUrl),
  });
  const walletClient = createWalletClient({
    account,
    chain: reactiveTestnetChain,
    transport: http(rpcUrl),
  });

  // Load reactor ABI
  const artifactPath = path.join(
    process.cwd(),
    "artifacts/contracts/reactive/ChainlinkFeedReactor.sol/ChainlinkFeedReactor.json"
  );
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf-8"));
  const abi = artifact.abi;

  console.log("🧪 Testing react() function manually");
  console.log("====================================");
  console.log("Reactor:", reactorAddress);
  console.log("");

  // Get current metrics before
  const feedId =
    "0x4d60ad151e6b42e936738d5ef8c4f96337a8965aac4b8564acce38f5d94d253a";
  const metricsBefore = await publicClient.readContract({
    address: reactorAddress as `0x${string}`,
    abi: abi,
    functionName: "getFeedMetrics",
    args: [feedId],
  });

  console.log("📊 Metrics BEFORE test:");
  console.log(
    "   Events Received:",
    metricsBefore.totalEventsReceived.toString()
  );
  console.log(
    "   Updates Forwarded:",
    metricsBefore.updatesForwarded.toString()
  );
  console.log("");

  // Create a mock LogRecord
  // Chainlink AnswerUpdated: int256 indexed current, uint256 indexed roundId, uint256 updatedAt
  const mockPrice = BigInt("350000000000"); // $3500 with 8 decimals
  const mockRoundId = BigInt("12345");
  const mockUpdatedAt = BigInt(Math.floor(Date.now() / 1000));

  // LogRecord structure from IReactive
  const mockLogRecord = {
    chain_id: BigInt(11155111), // Sepolia
    _contract: getAddress("0x694AA1769357215DE4FAC081bf1f309aDC325306"), // Chainlink feed
    topic_0: BigInt(
      "0x0559884fd3a460db3073b7fc896cc77986f16e378210ded43186175bf646fc5f"
    ), // AnswerUpdated signature
    topic_1: mockPrice, // current price (indexed)
    topic_2: mockRoundId, // roundId (indexed)
    topic_3: BigInt(0),
    data: "0x" + mockUpdatedAt.toString(16).padStart(64, "0"), // updatedAt in data
    block_number: BigInt(0),
    op_code: BigInt(0),
    block_hash: BigInt(0),
    tx_hash: BigInt(0),
    log_index: BigInt(0),
  };

  console.log("📤 Attempting to call react() with mock data...");
  console.log("   Price:", mockPrice.toString());
  console.log("   Round ID:", mockRoundId.toString());
  console.log(
    "   Updated At:",
    new Date(Number(mockUpdatedAt) * 1000).toISOString()
  );
  console.log("");

  try {
    // Try to call react() - this will fail if reactorOnly modifier restricts it
    const txHash = await walletClient.writeContract({
      address: reactorAddress as `0x${string}`,
      abi: abi,
      functionName: "react",
      args: [mockLogRecord],
    });

    console.log("✅ Transaction sent:", txHash);
    console.log("⏳ Waiting for confirmation...");

    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash,
    });

    console.log("✅ Transaction confirmed!");
    console.log("   Block:", receipt.blockNumber);
    console.log("");

    // Check metrics after
    const metricsAfter = await publicClient.readContract({
      address: reactorAddress as `0x${string}`,
      abi: abi,
      functionName: "getFeedMetrics",
      args: [feedId],
    });

    console.log("📊 Metrics AFTER test:");
    console.log(
      "   Events Received:",
      metricsAfter.totalEventsReceived.toString()
    );
    console.log(
      "   Updates Forwarded:",
      metricsAfter.updatesForwarded.toString()
    );
    console.log("");

    if (
      Number(metricsAfter.totalEventsReceived) >
      Number(metricsBefore.totalEventsReceived)
    ) {
      console.log("✅ SUCCESS! react() function works!");
      console.log(
        "   The function can be called and processes events correctly."
      );
      console.log(
        "   The issue is that Reactive Network is not calling it automatically."
      );
    } else {
      console.log(
        "⚠️  Metrics didn't increase - function may have reverted or skipped"
      );
    }
  } catch (error: any) {
    console.error("❌ Error calling react():");
    console.error(error.message);
    console.log("");
    console.log("This could mean:");
    console.log("  1. reactorOnly modifier is blocking the call");
    console.log("  2. Function reverted for some reason");
    console.log("  3. Invalid LogRecord format");
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Error:", error);
    process.exit(1);
  });
