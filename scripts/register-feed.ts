/**
 * Script to register a Chainlink feed with ChainlinkFeedReactor
 *
 * Usage:
 *   npx hardhat run scripts/register-feed.ts --network reactiveTestnet
 *
 * Environment Variables:
 *   REACTOR_ADDRESS: The deployed ChainlinkFeedReactor address (required)
 *   ORIGIN_CHAIN_ID: Chain ID where Chainlink feed is located (e.g., 11155111 for Sepolia)
 *   FEED_ADDRESS: Chainlink aggregator address (required)
 *   DESTINATION_CHAIN_ID: Chain ID where FeedProxy is deployed (e.g., 97 for BNB testnet)
 *   DESTINATION_PROXY: FeedProxy contract address (required)
 *   FEED_DECIMALS: Number of decimals (default: 8)
 *   FEED_DESCRIPTION: Feed description (default: "ETH/USD")
 *   DEVIATION_THRESHOLD: Deviation threshold in basis points (default: 50 = 0.5%)
 *   HEARTBEAT: Heartbeat in seconds (default: 3600 = 1 hour)
 */

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

  console.log("🔗 Connecting to ChainlinkFeedReactor...");
  console.log("📝 Reactor address:", reactorAddress);
  console.log("👤 Deployer address:", deployerAddress);
  console.log("");

  // Load contract ABI from artifacts
  const artifactPath = path.join(
    process.cwd(),
    "artifacts/contracts/reactive/ChainlinkFeedReactor.sol/ChainlinkFeedReactor.json"
  );
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf-8"));
  const reactorAbi = artifact.abi;

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

  // Display registration parameters
  console.log("📋 Registration Parameters:");
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
  const txHash = await walletClient.writeContract({
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

  console.log("📤 Transaction hash:", txHash);
  console.log("⏳ Waiting for confirmation...");

  const receipt = await publicClient.waitForTransactionReceipt({
    hash: txHash,
  });
  console.log("✅ Transaction confirmed!");
  console.log("   Block:", receipt.blockNumber);
  console.log("");

  // Calculate feed ID (same as contract does: keccak256(abi.encodePacked(originChainId, feedAddress)))
  const feedId = keccak256(
    encodePacked(
      ["uint64", "address"],
      [BigInt(originChainId), getAddress(feedAddress)]
    )
  );

  console.log("✅ Feed registered successfully!");
  console.log("   Feed ID:", feedId);
  console.log("");
  console.log("💡 The reactor will now automatically monitor Chainlink events");
  console.log("   and forward updates to your FeedProxy when:");
  console.log(
    "   - Price deviates by",
    deviationThreshold.toString(),
    "basis points or more"
  );
  console.log("   - Heartbeat expires (", heartbeat.toString(), "seconds)");
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
