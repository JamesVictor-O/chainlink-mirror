

import { network } from "hardhat";
import {
  getAddress,
  keccak256,
  encodePacked,
  createPublicClient,
  http,
  createWalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { defineChain } from "viem";
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

// Chainlink AnswerUpdated event signature
// event AnswerUpdated(int256 indexed current, uint256 indexed roundId, uint256 updatedAt)
const ANSWER_UPDATED_TOPIC_0 =
  "0x0559884fd3a460db3073b7fc896cc77986f16e378210ded43186175bf646fc5f";

// Reactive Network system contract address
const SYSTEM_CONTRACT = "0x0000000000000000000000000000000000fffFfF";

// REACTIVE_IGNORE constant (for wildcard topics)
const REACTIVE_IGNORE = BigInt(
  "0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF"
);

async function main() {
  const reactorAddress = process.env.REACTOR_ADDRESS;
  const originChainId = process.env.ORIGIN_CHAIN_ID;
  const feedAddress = process.env.FEED_ADDRESS;
  const destinationChainId = process.env.DESTINATION_CHAIN_ID;
  const destinationProxy = process.env.DESTINATION_PROXY;

  // Required parameters
  if (!reactorAddress) {
    console.error("❌ Error: REACTOR_ADDRESS environment variable is required");
    console.log("Set it with: export REACTOR_ADDRESS=0x...");
    process.exit(1);
  }

  if (!originChainId) {
    console.error("❌ Error: ORIGIN_CHAIN_ID environment variable is required");
    console.log("Example: export ORIGIN_CHAIN_ID=11155111 (Sepolia)");
    process.exit(1);
  }

  if (!feedAddress) {
    console.error("❌ Error: FEED_ADDRESS environment variable is required");
    console.log(
      "Example: export FEED_ADDRESS=0x694AA1769357215DE4FAC081bf1f309aDC325306 (ETH/USD on Sepolia)"
    );
    process.exit(1);
  }

  if (!destinationChainId) {
    console.error(
      "❌ Error: DESTINATION_CHAIN_ID environment variable is required"
    );
    console.log("Example: export DESTINATION_CHAIN_ID=97 (BNB testnet)");
    process.exit(1);
  }

  if (!destinationProxy) {
    console.error(
      "❌ Error: DESTINATION_PROXY environment variable is required"
    );
    console.log("Set it with: export DESTINATION_PROXY=0x...");
    process.exit(1);
  }

  // Optional parameters with defaults
  const decimals = process.env.FEED_DECIMALS
    ? parseInt(process.env.FEED_DECIMALS)
    : 8;
  const description = process.env.FEED_DESCRIPTION || "ETH/USD";
  const deviationThreshold = process.env.DEVIATION_THRESHOLD
    ? BigInt(process.env.DEVIATION_THRESHOLD)
    : 50n; // 0.5% in basis points
  const heartbeat = process.env.HEARTBEAT
    ? BigInt(process.env.HEARTBEAT)
    : 3600n; // 1 hour

  // Get private key from environment
  const privateKey = process.env.REACTIVE_PRIVATE_KEY;
  if (!privateKey) {
    console.error(
      "❌ Error: REACTIVE_PRIVATE_KEY environment variable is required"
    );
    process.exit(1);
  }

  const reactiveRpcUrl =
    process.env.REACTIVE_TESTNET_RPC_URL || "https://lasna-rpc.rnk.dev";

  // Create clients
  const publicClient = createPublicClient({
    chain: reactiveTestnetChain,
    transport: http(reactiveRpcUrl),
  });

  const account = privateKeyToAccount(
    `0x${privateKey.replace(/^0x/, "")}` as `0x${string}`
  );
  const walletClient = createWalletClient({
    account,
    chain: reactiveTestnetChain,
    transport: http(reactiveRpcUrl),
  });

  const deployerAddress = account.address;

  console.log("🔗 Chainlink Feed Subscription Setup");
  console.log("====================================");
  console.log("📝 Reactor address:", reactorAddress);
  console.log("👤 Deployer address:", deployerAddress);
  console.log("");

  // Load contract ABIs
  const reactorArtifactPath = path.join(
    process.cwd(),
    "artifacts/contracts/reactive/ChainlinkFeedReactor.sol/ChainlinkFeedReactor.json"
  );
  const reactorArtifact = JSON.parse(
    fs.readFileSync(reactorArtifactPath, "utf-8")
  );
  const reactorAbi = reactorArtifact.abi;

  // Check current owner
  const owner = await publicClient.readContract({
    address: reactorAddress as `0x${string}`,
    abi: reactorAbi,
    functionName: "owner",
  });
  console.log("👑 Current owner:", owner);

  if (owner.toLowerCase() !== deployerAddress.toLowerCase()) {
    console.error("❌ Error: Deployer is not the owner of this contract");
    console.log("   Owner:", owner);
    console.log("   Deployer:", deployerAddress);
    process.exit(1);
  }

  // Calculate feed ID
  const feedId = keccak256(
    encodePacked(
      ["uint64", "address"],
      [BigInt(originChainId), getAddress(feedAddress)]
    )
  );

  // Check if feed is already registered
  console.log("🔍 Checking if feed is already registered...");
  let feedConfig;
  try {
    feedConfig = await publicClient.readContract({
      address: reactorAddress as `0x${string}`,
      abi: reactorAbi,
      functionName: "feeds",
      args: [feedId],
    });
  } catch (error) {
    console.error("❌ Error reading feed config:", error);
    process.exit(1);
  }

  const isRegistered = feedConfig && feedConfig[0] !== 0n; // originChainId will be non-zero if registered

  if (!isRegistered) {
    console.log("📋 Feed not registered. Registering now...");
    console.log("   Origin Chain ID:", originChainId);
    console.log("   Feed Address:", feedAddress);
    console.log("   Destination Chain ID:", destinationChainId);
    console.log("   Destination Proxy:", destinationProxy);
    console.log("   Decimals:", decimals);
    console.log("   Description:", description);
    console.log(
      "   Deviation Threshold:",
      deviationThreshold.toString(),
      "basis points"
    );
    console.log("   Heartbeat:", heartbeat.toString(), "seconds");
    console.log("");

    // Register feed
    console.log("➕ Registering feed...");
    const registerTxHash = await walletClient.writeContract({
      address: reactorAddress as `0x${string}`,
      abi: reactorAbi,
      functionName: "registerFeed",
      args: [
        BigInt(originChainId),
        getAddress(feedAddress),
        BigInt(destinationChainId),
        getAddress(destinationProxy),
        decimals,
        description,
        deviationThreshold,
        heartbeat,
      ],
    });

    console.log("📤 Registration transaction hash:", registerTxHash);
    console.log("⏳ Waiting for confirmation...");

    await publicClient.waitForTransactionReceipt({
      hash: registerTxHash,
    });
    console.log("✅ Feed registered successfully!");
    console.log("   Feed ID:", feedId);
    console.log("");
  } else {
    console.log("✅ Feed is already registered");
    console.log("   Feed ID:", feedId);
    console.log("");
  }

  // Now subscribe to events via system contract
  console.log("📡 Subscribing to Chainlink AnswerUpdated events...");
  console.log("   System Contract:", SYSTEM_CONTRACT);
  console.log("   Origin Chain ID:", originChainId);
  console.log("   Feed Address:", feedAddress);
  console.log("   Event Signature (topic_0):", ANSWER_UPDATED_TOPIC_0);
  console.log("   Topic 1 (current price):", "WILDCARD (any value)");
  console.log("   Topic 2 (roundId):", "WILDCARD (any value)");
  console.log("   Topic 3:", "WILDCARD (any value)");
  console.log("");

  // Load system contract ABI
  const systemContractAbi = [
    {
      inputs: [
        { name: "chain_id", type: "uint256" },
        { name: "_contract", type: "address" },
        { name: "topic_0", type: "uint256" },
        { name: "topic_1", type: "uint256" },
        { name: "topic_2", type: "uint256" },
        { name: "topic_3", type: "uint256" },
      ],
      name: "subscribe",
      outputs: [],
      stateMutability: "nonpayable",
      type: "function",
    },
  ] as const;

  // Subscribe to events
  // Note: We use REACTIVE_IGNORE for topics 1, 2, 3 to match any value
  // Topic 0 is the event signature (AnswerUpdated)
  const subscribeTxHash = await walletClient.writeContract({
    address: SYSTEM_CONTRACT as `0x${string}`,
    abi: systemContractAbi,
    functionName: "subscribe",
    args: [
      BigInt(originChainId), // chain_id
      getAddress(feedAddress), // _contract
      BigInt(ANSWER_UPDATED_TOPIC_0), // topic_0 (event signature)
      REACTIVE_IGNORE, // topic_1 (current price - wildcard)
      REACTIVE_IGNORE, // topic_2 (roundId - wildcard)
      REACTIVE_IGNORE, // topic_3 (unused - wildcard)
    ],
  });

  console.log("📤 Subscription transaction hash:", subscribeTxHash);
  console.log("⏳ Waiting for confirmation...");

  const receipt = await publicClient.waitForTransactionReceipt({
    hash: subscribeTxHash,
  });
  console.log("✅ Subscription confirmed!");
  console.log("   Block:", receipt.blockNumber);
  console.log("");

  console.log("🎉 Setup Complete!");
  console.log("==================");
  console.log("✅ Feed registered in ChainlinkFeedReactor");
  console.log("✅ Subscribed to Chainlink AnswerUpdated events");
  console.log("");
  console.log("💡 The reactor will now automatically:");
  console.log(
    "   1. Monitor Chainlink AnswerUpdated events on chain",
    originChainId
  );
  console.log(
    "   2. Process events when price deviates by",
    deviationThreshold.toString(),
    "basis points"
  );
  console.log(
    "   3. Forward updates to FeedProxy on chain",
    destinationChainId
  );
  console.log(
    "   4. Skip updates that don't meet deviation threshold (saves gas)"
  );
  console.log("");
  console.log("🔗 View on Reactscan:");
  console.log(
    "   Reactor:",
    `https://lasna.reactscan.io/address/${reactorAddress}`
  );
  console.log(
    "   System Contract:",
    `https://lasna.reactscan.io/address/${SYSTEM_CONTRACT}`
  );
  console.log("");
}

main()
  .then(() => process.exit(0))
  .catch((error: any) => {
    console.error("❌ Error:");

    // Check if it's an RPC error
    if (
      error?.message?.includes("unexpected status code") ||
      error?.message?.includes("RPC error") ||
      error?.cause?.details?.includes("unexpected status code")
    ) {
      console.error("");
      console.error("🔴 RPC Endpoint Error");
      console.error("The RPC endpoint is currently unavailable.");
      console.error("");
      console.error("💡 Quick Fix:");
      console.error("Update your .env.local to use a different RPC URL");
    } else {
      console.error(error);
    }
    process.exit(1);
  });
