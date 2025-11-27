

import { network } from "hardhat";

async function main() {
  // Get network name from command line args or default
  const networkArg = process.argv.find((arg) => arg.includes("--network"));
  const networkName = networkArg
    ? networkArg.split("=")[1] || networkArg.split(" ")[1]
    : "reactiveTestnet";

  // Determine network configuration
  let chainId: number;
  let rpcUrl: string;
  let explorerUrl: string;

  if (networkName === "reactiveMainnet" || networkName === "reactive") {
    chainId = 1597;
    rpcUrl =
      process.env.REACTIVE_MAINNET_RPC_URL || "https://rpc.reactive.network";
    explorerUrl = "https://reactscan.io";
    console.log("🌐 Reactive Mainnet (Chain ID: 1597)");
  } else if (networkName === "reactiveTestnet" || networkName === "lasna") {
    chainId = 5318007;
    rpcUrl =
      process.env.REACTIVE_TESTNET_RPC_URL ||
      "https://rpc.lasna.reactive.network";
    explorerUrl = "https://lasna.reactscan.io";
    console.log("🌐 Lasna Testnet (Chain ID: 5318007)");
  } else {
    throw new Error(
      `Invalid network: ${networkName}. Use 'reactiveMainnet' or 'reactiveTestnet'`
    );
  }

  console.log("");
  console.log(
    "⚠️  Note: For best results, use Foundry for Reactive Network deployment."
  );
  console.log("");
  console.log("📋 Foundry Deployment Command:");
  console.log("");
  console.log("forge create \\");
  console.log(`  --rpc-url ${rpcUrl} \\`);
  console.log(`  --private-key $REACTIVE_PRIVATE_KEY \\`);
  console.log(`  --chain-id ${chainId} \\`);
  console.log(`  --verify \\`);
  console.log(`  --verifier sourcify \\`);
  console.log(`  --verifier-url https://sourcify.rnk.dev/ \\`);
  console.log(
    `  contracts/reactive/ChainlinkFeedReactor.sol:ChainlinkFeedReactor`
  );
  console.log("");
  console.log("Or use the shell script:");
  console.log(
    `  ./scripts/deploy-reactive.sh ${
      networkName === "reactiveMainnet" ? "mainnet" : "testnet"
    }`
  );
  console.log("");
  console.log("After deployment, verify on Reactscan:");
  console.log(`  ${explorerUrl}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
