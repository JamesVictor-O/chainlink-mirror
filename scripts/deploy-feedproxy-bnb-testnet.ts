

import { network } from "hardhat";

async function main() {
  // Connect to network
  const { viem } = await network.connect();
  const [deployer] = await viem.getWalletClients();
  const publicClient = await viem.getPublicClient();

  console.log("🚀 Deploying FeedProxy to BNB Smart Chain...");
  console.log("📝 Deploying with account:", deployer.account.address);
  
  const balance = await publicClient.getBalance({
    address: deployer.account.address,
  });
  console.log("💰 Account balance:", (balance / BigInt(10 ** 18)).toString(), "BNB");
  console.log("");

  // Get constructor arguments from environment or use defaults
  const decimals = process.env.FEEDPROXY_DECIMALS 
    ? parseInt(process.env.FEEDPROXY_DECIMALS) 
    : 8;
  const description = process.env.FEEDPROXY_DESCRIPTION || "ETH/USD";
  const heartbeat = process.env.FEEDPROXY_HEARTBEAT 
    ? BigInt(process.env.FEEDPROXY_HEARTBEAT) 
    : 3600n;

  console.log("📦 Constructor Arguments:");
  console.log("   - decimals:", decimals);
  console.log("   - description:", description);
  console.log("   - heartbeat:", heartbeat.toString(), "seconds");
  console.log("");

  // Deploy FeedProxy
  console.log("📦 Deploying FeedProxy contract...");
  const feedProxy = await viem.deployContract("FeedProxy", [
    decimals,
    description,
    heartbeat,
  ]);

  console.log("✅ FeedProxy deployed to:", feedProxy.address);
  console.log("");

  // Get network info
  const chainId = await publicClient.getChainId();
  let explorerUrl: string;
  let networkName: string;
  
  if (chainId === 56n) {
    explorerUrl = "https://bscscan.com";
    networkName = "BNB Smart Chain Mainnet";
  } else if (chainId === 97n) {
    explorerUrl = "https://testnet.bscscan.com";
    networkName = "BNB Smart Chain Testnet";
  } else {
    explorerUrl = "https://bscscan.com";
    networkName = "Unknown";
  }

  console.log("🌐 Network:", networkName);
  console.log("🔗 View on explorer:", `${explorerUrl}/address/${feedProxy.address}`);
  console.log("");

  console.log("📋 Next Steps:");
  console.log("1. Save the contract address:", feedProxy.address);
  console.log("2. Verify the contract on BscScan");
  console.log("3. Add authorized sender (your ChainlinkFeedReactor address):");
  console.log(`   feedProxy.addAuthorizedSender(reactorAddress)`);
  console.log("4. Test the feed by calling updateRoundData()");
  console.log("");

  console.log("💡 Example: Add authorized sender");
  console.log("   Using Hardhat console:");
  console.log(`   npx hardhat console --network bnbTestnet`);
  console.log(`   const feedProxy = await ethers.getContractAt("FeedProxy", "${feedProxy.address}")`);
  console.log(`   await feedProxy.addAuthorizedSender("REACTOR_ADDRESS")`);
  console.log("");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Deployment failed:");
    console.error(error);
    process.exit(1);
  });


