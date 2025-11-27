/**
 * Script to manually forward a Chainlink event to test the full flow
 * 
 * This script:
 * 1. Gets latest Chainlink data from Sepolia
 * 2. Calls react() on the reactor with that data
 * 3. Manually executes the callback on FeedProxy (simulating Reactive Network bridge)
 * 
 * Usage:
 *   npx hardhat run scripts/manual-forward-event.ts --network reactiveTestnet
 */

import { createPublicClient, http, createWalletClient, getAddress, encodeFunctionData } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { defineChain } from "viem";
import * as fs from "fs";
import * as path from "path";

// Reactive Network testnet
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

// BNB Testnet
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
        process.env.BNB_TESTNET_RPC_URL || "https://bsc-testnet.publicnode.com",
      ],
    },
  },
});

// Sepolia
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
  const reactorAddress = process.env.REACTOR_ADDRESS;
  const feedProxyAddress = process.env.FEEDPROXY_ADDRESS || process.env.DESTINATION_PROXY;
  const privateKey = process.env.REACTIVE_PRIVATE_KEY;
  const bnbPrivateKey = process.env.BNB_PRIVATE_KEY || privateKey;

  if (!reactorAddress) {
    console.error("❌ REACTOR_ADDRESS not set");
    process.exit(1);
  }

  if (!feedProxyAddress) {
    console.error("❌ FEEDPROXY_ADDRESS not set");
    process.exit(1);
  }

  if (!privateKey) {
    console.error("❌ REACTIVE_PRIVATE_KEY not set");
    process.exit(1);
  }

  console.log("🔄 Manual Event Forwarding Test");
  console.log("===============================");
  console.log("");

  // Step 1: Get latest Chainlink data from Sepolia
  console.log("1️⃣  Fetching latest Chainlink data from Sepolia...");
  const sepoliaClient = createPublicClient({
    chain: sepoliaChain,
    transport: http("https://ethereum-sepolia-rpc.publicnode.com"),
  });

  const chainlinkFeedAddress = "0x694AA1769357215DE4FAC081bf1f309aDC325306";
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

  const roundData = await sepoliaClient.readContract({
    address: chainlinkFeedAddress as `0x${string}`,
    abi: aggregatorAbi,
    functionName: "latestRoundData",
  });

  const [roundId, answer, startedAt, updatedAt, answeredInRound] = roundData;

  console.log("✅ Chainlink Data Retrieved:");
  console.log("   Round ID:", roundId.toString());
  console.log("   Price:", answer.toString(), "(raw, with decimals)");
  console.log("   Updated At:", new Date(Number(updatedAt) * 1000).toISOString());
  console.log("   Time Since Update:", Math.floor((Date.now() / 1000 - Number(updatedAt)) / 60), "minutes");
  console.log("");

  // Step 2: Call react() on reactor
  console.log("2️⃣  Calling react() on ChainlinkFeedReactor...");
  const reactiveClient = createPublicClient({
    chain: reactiveTestnetChain,
    transport: http(process.env.REACTIVE_TESTNET_RPC_URL || "https://lasna-rpc.rnk.dev"),
  });

  const reactiveAccount = privateKeyToAccount(
    `0x${privateKey.replace(/^0x/, "")}` as `0x${string}`
  );
  const reactiveWallet = createWalletClient({
    account: reactiveAccount,
    chain: reactiveTestnetChain,
    transport: http(process.env.REACTIVE_TESTNET_RPC_URL || "https://lasna-rpc.rnk.dev"),
  });

  // Load reactor ABI
  const reactorArtifactPath = path.join(
    process.cwd(),
    "artifacts/contracts/reactive/ChainlinkFeedReactor.sol/ChainlinkFeedReactor.json"
  );
  const reactorArtifact = JSON.parse(fs.readFileSync(reactorArtifactPath, "utf-8"));
  const reactorAbi = reactorArtifact.abi;

  // Get metrics before
  const feedId = "0x4d60ad151e6b42e936738d5ef8c4f96337a8965aac4b8564acce38f5d94d253a";
  const metricsBefore = await reactiveClient.readContract({
    address: reactorAddress as `0x${string}`,
    abi: reactorAbi,
    functionName: "getFeedMetrics",
    args: [feedId],
  });

  console.log("   Metrics before:", {
    eventsReceived: metricsBefore.totalEventsReceived.toString(),
    updatesForwarded: metricsBefore.updatesForwarded.toString(),
  });

  // Create LogRecord
  const logRecord = {
    chain_id: BigInt(11155111), // Sepolia
    _contract: getAddress(chainlinkFeedAddress),
    topic_0: BigInt("0x0559884fd3a460db3073b7fc896cc77986f16e378210ded43186175bf646fc5f"),
    topic_1: answer, // current price
    topic_2: roundId, // roundId
    topic_3: BigInt(0),
    data: "0x" + updatedAt.toString(16).padStart(64, "0"), // updatedAt
    block_number: BigInt(0),
    op_code: BigInt(0),
    block_hash: BigInt(0),
    tx_hash: BigInt(0),
    log_index: BigInt(0),
  };

  // Call react()
  const reactTxHash = await reactiveWallet.writeContract({
    address: reactorAddress as `0x${string}`,
    abi: reactorAbi,
    functionName: "react",
    args: [logRecord],
  });

  console.log("   Transaction:", reactTxHash);
  console.log("   Waiting for confirmation...");

  const reactReceipt = await reactiveClient.waitForTransactionReceipt({
    hash: reactTxHash,
  });

  console.log("✅ react() called successfully!");
  console.log("   Block:", reactReceipt.blockNumber);
  console.log("");

  // Check for Callback event
  const callbackEvent = reactReceipt.logs.find((log: any) => {
    // Callback event signature
    return log.topics[0] === "0x9316df45c3226259b8d7f2d32687edb5a88141d5f47d0d6b67b927f3030c66d1";
  });

  if (!callbackEvent) {
    console.error("❌ No Callback event emitted!");
    console.log("   This means react() didn't forward the update");
    return;
  }

  console.log("✅ Callback event emitted!");
  console.log("   This means reactor wants to forward to FeedProxy");
  console.log("");

  // Step 3: Manually execute callback on FeedProxy (simulating Reactive Network bridge)
  console.log("3️⃣  Manually executing callback on FeedProxy...");
  console.log("   (Simulating what Reactive Network bridge would do)");
  console.log("");

  const bnbClient = createPublicClient({
    chain: bnbTestnetChain,
    transport: http(process.env.BNB_TESTNET_RPC_URL || "https://bsc-testnet.publicnode.com"),
  });

  const bnbAccount = privateKeyToAccount(
    `0x${bnbPrivateKey.replace(/^0x/, "")}` as `0x${string}`
  );
  const bnbWallet = createWalletClient({
    account: bnbAccount,
    chain: bnbTestnetChain,
    transport: http(process.env.BNB_TESTNET_RPC_URL || "https://bsc-testnet.publicnode.com"),
  });

  // Load FeedProxy ABI
  const feedProxyArtifactPath = path.join(
    process.cwd(),
    "artifacts/contracts/destination/FeedProxy.sol/FeedProxy.json"
  );
  const feedProxyArtifact = JSON.parse(fs.readFileSync(feedProxyArtifactPath, "utf-8"));
  const feedProxyAbi = feedProxyArtifact.abi;

  // Check FeedProxy state before
  let feedProxyDataBefore;
  try {
    feedProxyDataBefore = await bnbClient.readContract({
      address: feedProxyAddress as `0x${string}`,
      abi: feedProxyAbi,
      functionName: "latestRoundData",
    });
    console.log("   FeedProxy before:");
    console.log("     Round ID:", feedProxyDataBefore[0].toString());
    console.log("     Price:", feedProxyDataBefore[1].toString());
  } catch (e: any) {
    if (e.message?.includes("NoDataAvailable")) {
      console.log("   FeedProxy before: No data (uninitialized)");
    } else {
      throw e;
    }
  }
  console.log("");

  // Call updateRoundData on FeedProxy
  console.log("   Calling updateRoundData() on FeedProxy...");
  const updateTxHash = await bnbWallet.writeContract({
    address: feedProxyAddress as `0x${string}`,
    abi: feedProxyAbi,
    functionName: "updateRoundData",
    args: [
      roundId,
      answer,
      updatedAt,
      answeredInRound,
    ],
  });

  console.log("   Transaction:", updateTxHash);
  console.log("   Waiting for confirmation...");

  const updateReceipt = await bnbClient.waitForTransactionReceipt({
    hash: updateTxHash,
  });

  console.log("✅ FeedProxy updated successfully!");
  console.log("   Block:", updateReceipt.blockNumber);
  console.log("");

  // Check FeedProxy state after
  const feedProxyDataAfter = await bnbClient.readContract({
    address: feedProxyAddress as `0x${string}`,
    abi: feedProxyAbi,
    functionName: "latestRoundData",
  });

  console.log("✅ FeedProxy after:");
  console.log("   Round ID:", feedProxyDataAfter[0].toString());
  console.log("   Price:", feedProxyDataAfter[1].toString());
  console.log("   Updated At:", new Date(Number(feedProxyDataAfter[3]) * 1000).toISOString());
  console.log("");

  // Check reactor metrics after
  const metricsAfter = await reactiveClient.readContract({
    address: reactorAddress as `0x${string}`,
    abi: reactorAbi,
    functionName: "getFeedMetrics",
    args: [feedId],
  });

  console.log("📊 Final Metrics:");
  console.log("   Events Received:", metricsAfter.totalEventsReceived.toString());
  console.log("   Updates Forwarded:", metricsAfter.updatesForwarded.toString());
  console.log("");

  console.log("🎉 Complete Flow Test Successful!");
  console.log("=================================");
  console.log("");
  console.log("✅ Chainlink data retrieved from Sepolia");
  console.log("✅ react() called on reactor");
  console.log("✅ Callback event emitted");
  console.log("✅ FeedProxy updated with new data");
  console.log("");
  console.log("💡 Your frontend should now show:");
  console.log("   - Updated price from FeedProxy");
  console.log("   - Recent 'Last Update' time");
  console.log("   - Healthy status");
  console.log("");
  console.log("🔗 View on block explorers:");
  console.log("   Reactor:", `https://lasna.reactscan.io/tx/${reactTxHash}`);
  console.log("   FeedProxy:", `https://testnet.bscscan.com/tx/${updateTxHash}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Error:", error);
    process.exit(1);
  });


