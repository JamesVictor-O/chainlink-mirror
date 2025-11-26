/**
 * Polls Sepolia's Chainlink feed, runs reactor decision logic, and writes to FeedProxy.
 *
 * Required env:
 *   REACTOR_ADDRESS
 *   ORIGIN_CHAIN_ID
 *   FEED_ADDRESS
 *   REACTIVE_PRIVATE_KEY
 *   DESTINATION_PROXY
 *   BNB_RPC_URL
 *   BNB_PRIVATE_KEY
 */
import { createPublicClient, http, createWalletClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { defineChain } from "viem";
import { getAddress, keccak256, encodePacked } from "viem";
import { ethers } from "ethers"; // v6
import * as fs from "fs";
import * as path from "path";

const reactiveTestnetChain = defineChain({
  id: 5318007,
  name: "Lasna Testnet",
  nativeCurrency: { decimals: 18, name: "Ether", symbol: "ETH" },
  rpcUrls: {
    default: {
      http: [
        process.env.REACTIVE_TESTNET_RPC_URL || "https://lasna-rpc.rnk.dev",
      ],
    },
  },
});

async function main() {
  console.log("\n🔄 Polling Chainlink Feed");
  console.log("=========================\n");

  const reactorAddress = process.env.REACTOR_ADDRESS;
  const originChainId = process.env.ORIGIN_CHAIN_ID;
  const feedAddress = process.env.FEED_ADDRESS;
  const destinationProxy = process.env.DESTINATION_PROXY;
  const bnbRpcUrl = process.env.BNB_RPC_URL;
  const bnbPrivateKey = process.env.BNB_PRIVATE_KEY;
  const reactivePrivateKey = process.env.REACTIVE_PRIVATE_KEY;

  if (
    !reactorAddress ||
    !originChainId ||
    !feedAddress ||
    !reactivePrivateKey
  ) {
    console.error(
      "❌ Missing REACTOR_ADDRESS/ORIGIN_CHAIN_ID/FEED_ADDRESS/REACTIVE_PRIVATE_KEY"
    );
    process.exit(1);
  }

  console.log("📋 Configuration:");
  console.log(`   Reactor: ${reactorAddress}`);
  console.log(`   Origin Chain: ${originChainId}`);
  console.log(`   Feed Address: ${feedAddress}`);
  console.log(`   Destination Proxy: ${destinationProxy || "Not set"}\n`);

  // Setup Reactive Network client (viem)
  const reactivePublicClient = createPublicClient({
    chain: reactiveTestnetChain,
    transport: http(
      process.env.REACTIVE_TESTNET_RPC_URL || "https://lasna-rpc.rnk.dev"
    ),
  });

  const reactiveWalletClient = createWalletClient({
    account: privateKeyToAccount(
      `0x${reactivePrivateKey.replace(/^0x/, "")}` as `0x${string}`
    ),
    chain: reactiveTestnetChain,
    transport: http(
      process.env.REACTIVE_TESTNET_RPC_URL || "https://lasna-rpc.rnk.dev"
    ),
  });

  // ✅ FIXED: Setup Chainlink provider (Sepolia) - ethers v6
  const chainlinkProvider = new ethers.JsonRpcProvider(
    "https://ethereum-sepolia-rpc.publicnode.com"
  );

  const chainlinkContract = new ethers.Contract(
    getAddress(feedAddress),
    [
      "function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)",
    ],
    chainlinkProvider
  );

  // Load reactor ABI
  const reactorArtifact = JSON.parse(
    fs.readFileSync(
      path.join(
        process.cwd(),
        "artifacts/contracts/reactive/ChainlinkFeedReactor.sol/ChainlinkFeedReactor.json"
      ),
      "utf-8"
    )
  );
  const reactorAbi = reactorArtifact.abi;

  // Calculate feed ID
  const feedId = keccak256(
    encodePacked(
      ["uint64", "address"],
      [BigInt(originChainId), getAddress(feedAddress)]
    )
  );

  console.log(`   Feed ID: ${feedId}\n`);

  // Step 1: Fetch latest round data from Chainlink
  console.log("1️⃣  Fetching latest round data from Chainlink...");

  // ✅ FIXED: Ethers v6 returns array directly, no .toNumber()
  const latestRoundData = await chainlinkContract.latestRoundData();
  const roundId = latestRoundData[0];
  const answer = latestRoundData[1];
  const startedAt = latestRoundData[2];
  const updatedAt = latestRoundData[3];
  const answeredInRound = latestRoundData[4];

  console.log("✅ Chainlink Data:");
  console.log(`   Round ID: ${roundId.toString()}`);
  console.log(`   Price: ${ethers.formatUnits(answer, 8)}`); // ✅ FIXED: formatUnits
  console.log(
    `   Updated At: ${new Date(Number(updatedAt) * 1000).toISOString()}`
  );

  const timeSinceUpdate = Math.floor(Date.now() / 1000) - Number(updatedAt);
  console.log(
    `   Time Since Update: ${Math.floor(timeSinceUpdate / 60)}m ${
      timeSinceUpdate % 60
    }s\n`
  );

  // Step 2: Call reactor's pollFeed to check if should forward
  console.log("2️⃣  Calling reactor.pollFeed() for decision logic...");

  try {
    const pollTx = await reactiveWalletClient.writeContract({
      address: reactorAddress as `0x${string}`,
      abi: reactorAbi,
      functionName: "pollFeed",
      args: [
        feedId,
        BigInt(roundId.toString()),
        BigInt(answer.toString()),
        BigInt(updatedAt.toString()),
        BigInt(answeredInRound.toString()),
      ],
    });

    console.log(`   Transaction: ${pollTx}`);
    console.log("   Waiting for confirmation...");

    const receipt = await reactivePublicClient.waitForTransactionReceipt({
      hash: pollTx,
    });

    console.log(`✅ pollFeed() called successfully!`);
    console.log(`   Block: ${receipt.blockNumber}\n`);
  } catch (error: any) {
    if (
      error.message?.includes("Feed not active") ||
      error.message?.includes("already processed")
    ) {
      console.log("⏭️  Round already processed by reactor, skipping...\n");
      return;
    }
    throw error;
  }

  // Step 3: Read config to determine if we should forward
  console.log("3️⃣  Reading reactor decision...");

  const config = (await reactivePublicClient.readContract({
    address: reactorAddress as `0x${string}`,
    abi: reactorAbi,
    functionName: "getFeedConfig",
    args: [feedId],
  })) as any;

  const metrics = (await reactivePublicClient.readContract({
    address: reactorAddress as `0x${string}`,
    abi: reactorAbi,
    functionName: "getFeedMetrics",
    args: [feedId],
  })) as any;

  console.log("   Events Received:", metrics.totalEventsReceived.toString());
  console.log("   Updates Forwarded:", metrics.updatesForwarded.toString());
  console.log("   Updates Skipped:", metrics.updatesSkipped.toString());

  // Step 4: Check if should forward based on deviation/heartbeat
  const shouldForwardUpdate = shouldForward(
    config,
    BigInt(answer.toString()),
    BigInt(updatedAt.toString())
  );

  if (!shouldForwardUpdate) {
    console.log(
      "\n⏭️  Skipping FeedProxy update (deviation/heartbeat not met)."
    );

    // Show why it was skipped
    const lastPrice = BigInt(config.lastSentPrice);
    const deviation = calcDeviation(lastPrice, BigInt(answer.toString()));
    const deviationPercent = Number(deviation) / 100;
    const thresholdPercent = Number(config.deviationThreshold) / 100;

    console.log(`   Current deviation: ${deviationPercent.toFixed(2)}%`);
    console.log(`   Required threshold: ${thresholdPercent.toFixed(2)}%`);

    const timeSinceLastSent = Number(
      BigInt(updatedAt.toString()) - BigInt(config.lastSentTime)
    );
    const heartbeatSeconds = Number(config.heartbeat);
    console.log(`   Time since last update: ${timeSinceLastSent}s`);
    console.log(`   Heartbeat threshold: ${heartbeatSeconds}s\n`);
    return;
  }

  // Step 5: Forward to FeedProxy on destination chain
   if (!destinationProxy || !bnbRpcUrl || !bnbPrivateKey) {
     console.warn("⚠️  Missing destination settings; cannot forward update.");
     return;
   }

   console.log("\n4️⃣  Forwarding update to FeedProxy on destination chain...");

   const feedProxyAbi = JSON.parse(
     fs.readFileSync(
       path.join(process.cwd(), "frontend/src/abis/FeedProxy.json"),
       "utf-8"
     )
   );

   const destinationProvider = new ethers.JsonRpcProvider(bnbRpcUrl);
   const destinationWallet = new ethers.Wallet(
     bnbPrivateKey,
     destinationProvider
   );

   const feedProxy = new ethers.Contract(
     destinationProxy,
     feedProxyAbi.abi,
     destinationWallet
   );

   try {
     const updateTx = await feedProxy.updateRoundData(
       roundId,
       answer,
       updatedAt,
       answeredInRound,
       {
         gasLimit: 200000n,
       }
     );

     console.log(`   Transaction: ${updateTx.hash}`);
     console.log("   Waiting for confirmation...");

     await updateTx.wait();

     console.log("✅ FeedProxy updated successfully!\n");

     // ✅ NEW: Confirm forward on reactor
     console.log("5️⃣  Confirming forward on reactor...");

     // Determine reason from earlier check
     let updateReason = 0; // FirstUpdate
     const lastPrice = BigInt(config.lastSentPrice);
     if (lastPrice !== 0n) {
       const deviation = calcDeviation(lastPrice, BigInt(answer.toString()));
       if (deviation >= BigInt(config.deviationThreshold)) {
         updateReason = 1; // DeviationThreshold
       } else {
         updateReason = 2; // HeartbeatExpired
       }
     }

     const confirmTx = await reactiveWalletClient.writeContract({
       address: reactorAddress as `0x${string}`,
       abi: reactorAbi,
       functionName: "confirmForward",
       args: [
         feedId,
         BigInt(answer.toString()),
         BigInt(updatedAt.toString()),
         updateReason,
       ],
     });

     await reactivePublicClient.waitForTransactionReceipt({ hash: confirmTx });
     console.log("✅ Reactor state updated!\n");

     console.log("🎉 Polling complete!\n");
   } catch (error: any) {
     if (
       error.message?.includes("InvalidRound") ||
       error.message?.includes("Paused")
     ) {
       console.log("⚠️  FeedProxy rejected update:", error.message);
       return;
     }
     throw error;
   }
}

function shouldForward(
  config: any,
  newPrice: bigint,
  updatedAt: bigint
): boolean {
  const lastPrice = BigInt(config.lastSentPrice);
  const lastTime = BigInt(config.lastSentTime);
  const deviationThreshold = BigInt(config.deviationThreshold);
  const heartbeat = BigInt(config.heartbeat);

  // First update always forwards
  if (lastPrice === 0n) {
    console.log("   Reason: First update");
    return true;
  }

  // Check deviation
  const deviation = calcDeviation(lastPrice, newPrice);
  if (deviation >= deviationThreshold) {
    console.log(
      `   Reason: Deviation threshold met (${Number(deviation) / 100}%)`
    );
    return true;
  }

  // Check heartbeat
  const timeSinceLastSent = updatedAt - lastTime;
  if (timeSinceLastSent >= heartbeat) {
    console.log(`   Reason: Heartbeat expired (${timeSinceLastSent}s)`);
    return true;
  }

  return false;
}

function calcDeviation(oldPrice: bigint, newPrice: bigint): bigint {
  if (oldPrice === 0n) return 10000n;
  const diff = newPrice > oldPrice ? newPrice - oldPrice : oldPrice - newPrice;
  return (diff * 10000n) / oldPrice;
}

main().catch((error) => {
  console.error("❌ Poll job failed:", error);
  process.exit(1);
});
