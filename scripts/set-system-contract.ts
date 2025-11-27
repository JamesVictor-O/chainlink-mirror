/**
 * Script to set system contract address after deployment
 *
 * Use this if you deployed without the system contract address
 * and found it later.
 *
 * Usage:
 *   export REACTOR_ADDRESS=0x...
 *   export REACTIVE_SYSTEM_CONTRACT=0x...
 *   npx hardhat run scripts/set-system-contract.ts --network reactive
 */

import { network } from "hardhat";
import {
  getAddress,
  createPublicClient,
  http,
  createWalletClient,
  getContract,
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
  const systemContractAddress =
    process.env.REACTIVE_SYSTEM_CONTRACT ||
    "0x0000000000000000000000000000000000fffFfF";

  if (!reactorAddress) {
    console.error("❌ Error: REACTOR_ADDRESS environment variable is required");
    console.log("Set it with: export REACTOR_ADDRESS=0x...");
    process.exit(1);
  }

  if (
    !systemContractAddress ||
    systemContractAddress === "0x0000000000000000000000000000000000000000"
  ) {
    console.error(
      "❌ Error: REACTIVE_SYSTEM_CONTRACT environment variable is required"
    );
    console.log("Set it with: export REACTIVE_SYSTEM_CONTRACT=0x...");
    console.log("   Default: 0x0000000000000000000000000000000000fffFfF");
    process.exit(1);
  }

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

  console.log("🔗 Setting System Contract Address\n");
  console.log("=".repeat(60));
  console.log("📝 Reactor Address:", reactorAddress);
  console.log("📝 System Contract:", systemContractAddress);
  console.log("👤 Deployer Address:", deployerAddress);
  console.log("");

  // Load contract ABI from artifacts
  const artifactPath = path.join(
    process.cwd(),
    "artifacts/contracts/reactive/ChainlinkFeedReactor.sol/ChainlinkFeedReactor.json"
  );
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf-8"));
  const reactorAbi = artifact.abi;

  // Check owner
  const owner = await publicClient.readContract({
    address: reactorAddress as `0x${string}`,
    abi: reactorAbi,
    functionName: "owner",
  });
  console.log("👑 Contract Owner:", owner);

  if (owner.toLowerCase() !== deployerAddress.toLowerCase()) {
    console.error("❌ Error: Deployer is not the owner of this contract");
    process.exit(1);
  }

  // Check current system contract (try getSystemContract first, fallback to service variable)
  let currentSystemContract: string;
  try {
    currentSystemContract = (await publicClient.readContract({
      address: reactorAddress as `0x${string}`,
      abi: reactorAbi,
      functionName: "getSystemContract",
    })) as string;
  } catch (error: any) {
    // If getSystemContract doesn't exist, try reading service variable directly
    try {
      currentSystemContract = (await publicClient.readContract({
        address: reactorAddress as `0x${string}`,
        abi: reactorAbi,
        functionName: "service",
      })) as string;
    } catch (e: any) {
      console.log(
        "⚠️  Could not read current system contract - may be old contract version"
      );
      currentSystemContract = "0x0000000000000000000000000000000000000000";
    }
  }
  console.log("🔧 Current System Contract:", currentSystemContract);
  console.log("");

  if (
    currentSystemContract.toLowerCase() ===
    getAddress(systemContractAddress).toLowerCase()
  ) {
    console.log("✅ System contract is already set to this address");
    return;
  }

  // Set system contract
  console.log("➕ Setting system contract address...");
  const txHash = await walletClient.writeContract({
    address: reactorAddress as `0x${string}`,
    abi: reactorAbi,
    functionName: "setSystemContract",
    args: [getAddress(systemContractAddress)],
  });

  console.log("📤 Transaction hash:", txHash);
  console.log("⏳ Waiting for confirmation...");

  const receipt = await publicClient.waitForTransactionReceipt({
    hash: txHash,
  });
  console.log("✅ Transaction confirmed!");
  console.log("   Block:", receipt.blockNumber);
  console.log("");

  // Verify
  let newSystemContract: string;
  try {
    newSystemContract = (await publicClient.readContract({
      address: reactorAddress as `0x${string}`,
      abi: reactorAbi,
      functionName: "getSystemContract",
    })) as string;
  } catch (error: any) {
    // Fallback to service variable
    newSystemContract = (await publicClient.readContract({
      address: reactorAddress as `0x${string}`,
      abi: reactorAbi,
      functionName: "service",
    })) as string;
  }

  if (
    newSystemContract.toLowerCase() ===
    getAddress(systemContractAddress).toLowerCase()
  ) {
    console.log("✅ System contract address set successfully!");
    console.log("");
    console.log("💡 Next steps:");
    console.log("   1. Re-register your feed to trigger subscription:");
    console.log(
      "      npx hardhat run scripts/register-feed.ts --network reactive"
    );
    console.log(
      "   2. Or subscribe existing feed manually using subscribeFeed()"
    );
    console.log("   3. Verify subscription appears on Reactscan");
  } else {
    console.error("❌ Verification failed - check transaction");
    console.error("   Expected:", systemContractAddress);
    console.error("   Got:", newSystemContract);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error: any) => {
    console.error("❌ Error:", error);
    process.exit(1);
  });
