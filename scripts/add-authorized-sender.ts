

import { network } from "hardhat";
import { getAddress } from "viem";

async function main() {
  const feedProxyAddress = process.env.FEEDPROXY_ADDRESS;
  const reactorAddress = process.env.REACTOR_ADDRESS;
  const reactiveBridgeAddress = process.env.REACTIVE_BRIDGE_ADDRESS;

  if (!feedProxyAddress) {
    console.error(
      "❌ Error: FEEDPROXY_ADDRESS environment variable is required"
    );
    console.log("Set it with: export FEEDPROXY_ADDRESS=0x...");
    process.exit(1);
  }

  // Use bridge address if provided, otherwise use reactor address
  const addressToAuthorize = reactiveBridgeAddress || reactorAddress;

  if (!addressToAuthorize) {
    console.error(
      "❌ Error: Either REACTOR_ADDRESS or REACTIVE_BRIDGE_ADDRESS is required"
    );
    console.log("Set it with: export REACTOR_ADDRESS=0x...");
    console.log("   OR");
    console.log("Set it with: export REACTIVE_BRIDGE_ADDRESS=0x...");
    console.log("");
    console.log(
      "💡 TIP: Run check-failed-txs.ts to find the correct bridge address"
    );
    process.exit(1);
  }

  if (reactiveBridgeAddress) {
    console.log("📝 Using Reactive Network bridge/router address");
  } else {
    console.log("📝 Using reactor contract address");
    console.log(
      "⚠️  NOTE: If this doesn't work, Reactive Network likely uses a bridge/router."
    );
    console.log("   Run check-failed-txs.ts to find the correct address.");
  }

  // Connect to network
  const { viem } = await network.connect();
  const [deployer] = await viem.getWalletClients();
  const publicClient = await viem.getPublicClient();

  console.log("🔗 Connecting to FeedProxy...");
  console.log("📝 FeedProxy address:", feedProxyAddress);
  console.log("👤 Deployer address:", deployer.account.address);
  console.log("");

  // Get contract instance
  const feedProxy = await viem.getContractAt(
    "FeedProxy",
    feedProxyAddress as `0x${string}`
  );

  // Check current owner
  const owner = await feedProxy.read.owner();
  console.log("👑 Current owner:", owner);

  if (owner.toLowerCase() !== deployer.account.address.toLowerCase()) {
    console.error("❌ Error: Deployer is not the owner of this contract");
    console.log("   Owner:", owner);
    console.log("   Deployer:", deployer.account.address);
    process.exit(1);
  }

  // Check if already authorized
  const isAuthorized = await feedProxy.read.authorizedSenders([
    getAddress(addressToAuthorize),
  ]);
  console.log("🔐 Currently authorized:", isAuthorized);
  console.log("");

  if (isAuthorized) {
    console.log("✅ Address is already authorized");
    return;
  }

  // Add authorized sender
  console.log("➕ Adding authorized sender:", addressToAuthorize);
  const txHash = await feedProxy.write.addAuthorizedSender(
    [getAddress(addressToAuthorize)],
    {
      account: deployer.account,
    }
  );

  console.log("📤 Transaction hash:", txHash);
  console.log("⏳ Waiting for confirmation...");

  const receipt = await publicClient.waitForTransactionReceipt({
    hash: txHash,
  });
  console.log("✅ Transaction confirmed!");
  console.log("   Block:", receipt.blockNumber);
  console.log("");

  // Verify authorization
  const nowAuthorized = await feedProxy.read.authorizedSenders([
    getAddress(addressToAuthorize),
  ]);
  if (nowAuthorized) {
    console.log("✅ Successfully authorized address!");
    console.log("");
    console.log("💡 Next steps:");
    console.log("   1. Wait for the next Chainlink price update");
    console.log("   2. Check if updates are now reaching FeedProxy");
    console.log("   3. Run diagnose-issue.ts to verify everything is working");
  } else {
    console.error("❌ Authorization failed - check transaction");
  }
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
      console.error("1. Update your .env.local to use a different RPC:");
      console.error(
        "   BNB_TESTNET_RPC_URL=https://bsc-testnet.publicnode.com"
      );
      console.error("");
      console.error("2. Or temporarily override it:");
      console.error(
        "   BNB_TESTNET_RPC_URL=https://bsc-testnet.publicnode.com npx hardhat run scripts/add-authorized-sender.ts --network bnbTestnet"
      );
      console.error("");
      console.error("Alternative RPC endpoints:");
      console.error("  - https://bsc-testnet.publicnode.com");
      console.error("  - https://bsc-testnet-rpc.publicnode.com");
      console.error("  - https://data-seed-prebsc-2-s1.binance.org:8545");
    } else {
      console.error(error);
    }
    process.exit(1);
  });
