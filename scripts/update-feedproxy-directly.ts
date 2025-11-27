
import { createPublicClient, http, createWalletClient, getAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { defineChain } from "viem";
import * as fs from "fs";
import * as path from "path";

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
  const feedProxyAddress =
    process.env.FEEDPROXY_ADDRESS || process.env.DESTINATION_PROXY;
  const privateKey =
    process.env.BNB_PRIVATE_KEY || process.env.REACTIVE_PRIVATE_KEY;

  if (!feedProxyAddress) {
    console.error("❌ FEEDPROXY_ADDRESS not set");
    process.exit(1);
  }

  if (!privateKey) {
    console.error("❌ BNB_PRIVATE_KEY or REACTIVE_PRIVATE_KEY not set");
    process.exit(1);
  }

  console.log("🔄 Direct FeedProxy Update Test");
  console.log("================================");
  console.log("");

  // Step 1: Get latest Chainlink data
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

  // Calculate price with decimals
  const decimals = 8;
  const price = Number(answer) / Math.pow(10, decimals);

  console.log("✅ Chainlink Data:");
  console.log("   Round ID:", roundId.toString());
  console.log(
    "   Price: $",
    price.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
  console.log(
    "   Updated At:",
    new Date(Number(updatedAt) * 1000).toISOString()
  );
  console.log(
    "   Time Since Update:",
    Math.floor((Date.now() / 1000 - Number(updatedAt)) / 60),
    "minutes"
  );
  console.log("");

  // Step 2: Check FeedProxy before
  console.log("2️⃣  Checking FeedProxy current state...");
  const bnbClient = createPublicClient({
    chain: bnbTestnetChain,
    transport: http(
      process.env.BNB_TESTNET_RPC_URL || "https://bsc-testnet.publicnode.com"
    ),
  });

  const feedProxyArtifactPath = path.join(
    process.cwd(),
    "artifacts/contracts/destination/FeedProxy.sol/FeedProxy.json"
  );
  const feedProxyArtifact = JSON.parse(
    fs.readFileSync(feedProxyArtifactPath, "utf-8")
  );
  const feedProxyAbi = feedProxyArtifact.abi;

  let feedProxyDataBefore;
  try {
    feedProxyDataBefore = await bnbClient.readContract({
      address: feedProxyAddress as `0x${string}`,
      abi: feedProxyAbi,
      functionName: "latestRoundData",
    });
    const priceBefore = Number(feedProxyDataBefore[1]) / Math.pow(10, decimals);
    console.log("   Current Round ID:", feedProxyDataBefore[0].toString());
    console.log(
      "   Current Price: $",
      priceBefore.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    );
    console.log(
      "   Last Updated:",
      new Date(Number(feedProxyDataBefore[3]) * 1000).toISOString()
    );
  } catch (e: any) {
    if (e.message?.includes("NoDataAvailable")) {
      console.log("   FeedProxy: No data (uninitialized)");
    } else {
      throw e;
    }
  }
  console.log("");

  // Step 3: Update FeedProxy
  console.log("3️⃣  Updating FeedProxy with latest Chainlink data...");
  const bnbAccount = privateKeyToAccount(
    `0x${privateKey.replace(/^0x/, "")}` as `0x${string}`
  );
  const bnbWallet = createWalletClient({
    account: bnbAccount,
    chain: bnbTestnetChain,
    transport: http(
      process.env.BNB_TESTNET_RPC_URL || "https://bsc-testnet.publicnode.com"
    ),
  });

  // Check if we're authorized
  const isAuthorized = await bnbClient.readContract({
    address: feedProxyAddress as `0x${string}`,
    abi: feedProxyAbi,
    functionName: "authorizedSenders",
    args: [bnbAccount.address],
  });

  if (!isAuthorized) {
    console.log("⚠️  Your address is not authorized. Authorizing now...");
    const authTxHash = await bnbWallet.writeContract({
      address: feedProxyAddress as `0x${string}`,
      abi: feedProxyAbi,
      functionName: "addAuthorizedSender",
      args: [bnbAccount.address],
    });
    await bnbClient.waitForTransactionReceipt({ hash: authTxHash });
    console.log("✅ Authorized!");
    console.log("");
  }

  // Update FeedProxy
  const updateTxHash = await bnbWallet.writeContract({
    address: feedProxyAddress as `0x${string}`,
    abi: feedProxyAbi,
    functionName: "updateRoundData",
    args: [roundId, answer, updatedAt, answeredInRound],
  });

  console.log("   Transaction:", updateTxHash);
  console.log("   Waiting for confirmation...");

  const updateReceipt = await bnbClient.waitForTransactionReceipt({
    hash: updateTxHash,
  });

  console.log("✅ FeedProxy updated!");
  console.log("   Block:", updateReceipt.blockNumber);
  console.log("");

  // Step 4: Verify update
  console.log("4️⃣  Verifying FeedProxy update...");
  const feedProxyDataAfter = await bnbClient.readContract({
    address: feedProxyAddress as `0x${string}`,
    abi: feedProxyAbi,
    functionName: "latestRoundData",
  });

  const priceAfter = Number(feedProxyDataAfter[1]) / Math.pow(10, decimals);
  const updatedAtAfter = Number(feedProxyDataAfter[3]);

  console.log("✅ FeedProxy Updated:");
  console.log("   Round ID:", feedProxyDataAfter[0].toString());
  console.log(
    "   Price: $",
    priceAfter.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
  console.log("   Updated At:", new Date(updatedAtAfter * 1000).toISOString());
  console.log(
    "   Time Since Update:",
    Math.floor((Date.now() / 1000 - updatedAtAfter) / 60),
    "minutes"
  );
  console.log("");

  console.log("🎉 Success!");
  console.log("===========");
  console.log("");
  console.log("✅ FeedProxy now has latest Chainlink data");
  console.log("✅ Your frontend should show:");
  console.log(
    "   - Updated price: $",
    priceAfter.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
  console.log("   - Recent 'Last Update' time");
  console.log("   - Healthy status");
  console.log("   - Round ID:", feedProxyDataAfter[0].toString());
  console.log("");
  console.log("🔗 View on BscScan:");
  console.log(`   https://testnet.bscscan.com/tx/${updateTxHash}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Error:", error);
    process.exit(1);
  });
