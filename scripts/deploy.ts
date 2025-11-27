/**
 * Deployment script for ChainlinkFeedReactor on Reactive Network
 *
 * Usage:
 *   npx hardhat run scripts/deploy.ts --network reactiveMainnet
 *   npx hardhat run scripts/deploy.ts --network reactiveTestnet
 *   npx hardhat run scripts/deploy.ts --network reactive
 *
 * Environment Variables Required:
 *   - REACTIVE_PRIVATE_KEY: Private key for deployment
 *   - REACTIVE_SYSTEM_CONTRACT: System contract address (REQUIRED for subscriptions to work)
 *   - REACTIVE_TESTNET_RPC_URL (optional): RPC URL for testnet
 *
 * NOTE: You MUST provide REACTIVE_SYSTEM_CONTRACT address for subscriptions to work!
 * Get this from Reactive Network documentation or support.
 */

import { network } from "hardhat";
import { createPublicClient, http, createWalletClient } from "viem";
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

  console.log("🚀 Deploying ChainlinkFeedReactor...");
  console.log("📝 Deploying with account:", deployerAddress);

  const balance = await publicClient.getBalance({
    address: deployerAddress,
  });
  console.log(
    "💰 Account balance:",
    (balance / BigInt(10 ** 18)).toString(),
    "ETH"
  );
  console.log("");

  // Get system contract address
  // Default to known system contract address for Reactive Network
  const systemContractAddress =
    process.env.REACTIVE_SYSTEM_CONTRACT ||
    "0x0000000000000000000000000000000000fffFfF"; // Known system contract address

  console.log("📝 System Contract Address:", systemContractAddress);
  console.log("   (Using default Reactive Network system contract)");
  console.log("   To override, set: export REACTIVE_SYSTEM_CONTRACT=0x...");
  console.log("");

  // Deploy ChainlinkFeedReactor
  // Constructor requires system contract address
  console.log("📦 Deploying ChainlinkFeedReactor contract...");
  console.log("   System Contract:", systemContractAddress);

  // Load contract ABI from artifacts
  const artifactPath = path.join(
    process.cwd(),
    "artifacts/contracts/reactive/ChainlinkFeedReactor.sol/ChainlinkFeedReactor.json"
  );
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf-8"));
  const contractAbi = artifact.abi;
  const contractBytecode = artifact.bytecode;

  // Deploy contract
  const hash = await walletClient.deployContract({
    account: account,
    chain: reactiveTestnetChain,
    abi: contractAbi,
    bytecode: contractBytecode as `0x${string}`,
    args: [systemContractAddress as `0x${string}`],
  });

  console.log("📤 Transaction hash:", hash);
  console.log("⏳ Waiting for confirmation...");

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  const reactorAddress = receipt.contractAddress;

  if (!reactorAddress) {
    throw new Error(
      "Contract deployment failed - no contract address in receipt"
    );
  }

  console.log("✅ ChainlinkFeedReactor deployed to:", reactorAddress);
  console.log("   Block:", receipt.blockNumber);
  console.log("");

  const explorerUrl = "https://lasna.reactscan.io";
  console.log("🌐 Network: Lasna Testnet (5318007)");
  console.log(
    "🔗 View on explorer:",
    `${explorerUrl}/address/${reactorAddress}`
  );
  console.log("");

  console.log("");
  console.log("📋 Next Steps:");
  console.log("1. Update frontend config with this address:");
  console.log(`   reactorAddress: "${reactorAddress}"`);
  console.log("");
  console.log("2. Register a feed:");
  console.log(`   export REACTOR_ADDRESS=${reactorAddress}`);
  console.log("   export ORIGIN_CHAIN_ID=11155111");
  console.log(
    "   export FEED_ADDRESS=0x694AA1769357215DE4FAC081bf1f309aDC325306"
  );
  console.log("   export DESTINATION_CHAIN_ID=97");
  console.log("   export DESTINATION_PROXY=0x...");
  console.log("   npx hardhat run scripts/register-feed.ts --network reactive");
  console.log("");
  console.log("3. Verify subscription on Reactscan");
  console.log(`   ${explorerUrl}/address/${reactorAddress}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Deployment failed:");
    console.error(error);
    process.exit(1);
  });
