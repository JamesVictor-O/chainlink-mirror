import { createPublicClient, http, createWalletClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { defineChain } from "viem";
import { getAddress, keccak256, encodePacked } from "viem";
import { ethers } from "ethers";
import * as fs from "fs";
import * as path from "path";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const reactiveTestnetChain = defineChain({
  id: 5318007,
  name: "Lasna Testnet",
  nativeCurrency: { decimals: 18, name: "Ether", symbol: "ETH" },
  rpcUrls: {
    default: {
      http: [process.env.REACTIVE_TESTNET_RPC_URL || "https://lasna-rpc.rnk.dev"],
    },
  },
});

async function main() {
  const reactorAddress = process.env.REACTOR_ADDRESS;
  const originChainId = process.env.ORIGIN_CHAIN_ID;
  const feedAddress = process.env.FEED_ADDRESS;
  const reactivePrivateKey = process.env.REACTIVE_PRIVATE_KEY;

  if (!reactorAddress || !originChainId || !feedAddress || !reactivePrivateKey) {
    console.error(
      "Missing REACTOR_ADDRESS/ORIGIN_CHAIN_ID/FEED_ADDRESS/REACTIVE_PRIVATE_KEY in .env.local"
    );
    process.exit(1);
  }

  const reactivePublicClient = createPublicClient({
    chain: reactiveTestnetChain,
    transport: http(reactiveTestnetChain.rpcUrls.default.http[0]),
  });

  const reactiveWalletClient = createWalletClient({
    account: privateKeyToAccount(
      `0x${reactivePrivateKey.replace(/^0x/, "")}` as `0x${string}`
    ),
    chain: reactiveTestnetChain,
    transport: http(reactiveTestnetChain.rpcUrls.default.http[0]),
  });

  const chainlinkProvider = new ethers.JsonRpcProvider(
    process.env.ORIGIN_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com"
  );

  const chainlinkContract = new ethers.Contract(
    getAddress(feedAddress),
    [
      "function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)",
    ],
    chainlinkProvider
  );

  const latestRoundData = await chainlinkContract.latestRoundData();
  const roundId = latestRoundData[0];
  const answer = latestRoundData[1];
  const updatedAt = latestRoundData[3];
  const answeredInRound = latestRoundData[4];

  console.log("Fetched Chainlink data:");
  console.log(`  roundId: ${roundId.toString()}`);
  console.log(`  answer: ${ethers.formatUnits(answer, 8)}`);
  console.log(`  updatedAt: ${new Date(Number(updatedAt) * 1000).toISOString()}`);

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

  const feedId = keccak256(
    encodePacked(["uint64", "address"], [BigInt(originChainId), getAddress(feedAddress)])
  );

  console.log(`Calling pollFeed for feedId ${feedId}...`);

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
    gas: 500000n,
    maxFeePerGas: 2000000000n,
    maxPriorityFeePerGas: 2000000000n,
  });

  console.log("  txHash:", pollTx);
  console.log("Waiting for confirmation (up to 90s)...");

  try {
    const receipt = await reactivePublicClient.waitForTransactionReceipt({
      hash: pollTx,
      timeout: 90_000,
    });
    console.log("✅ pollFeed confirmed in block", receipt.blockNumber);
  } catch (error: any) {
    console.error("⛔ pollFeed failed to confirm:", error);
  }
}

main().catch((error) => {
  console.error("Unexpected error:", error);
  process.exit(1);
});

