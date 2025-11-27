import { createPublicClient, http } from "viem";
import { bscTestnet } from "viem/chains";
import { readFileSync } from "node:fs";
const FeedProxyAbi = JSON.parse(
  readFileSync(new URL("../frontend/src/abis/FeedProxy.json", import.meta.url))
    .toString()
);

async function main() {
  const client = createPublicClient({
    chain: bscTestnet,
    transport: http("https://bsc-testnet.publicnode.com"),
  });

  const contract = new (await import("ethers")).Contract(
    "0x411fe7b4691733b69bff5b967b1d2dc5dd39e6aa",
    FeedProxyAbi.abi,
    {
      call: (args) => client.call(args),
    }
  );

  const [roundData, healthCheck, authorized] = await Promise.all([
    contract.latestRoundData(),
    contract.healthCheck(),
    contract.authorizedSenders("0x7FcfD3947A638377c37f445A794c1Ec0590c05f3"),
  ]);

  const [isHealthy, secondsSinceUpdate] = healthCheck;

  console.log("latestRoundData:", {
    roundId: roundData.roundId.toString(),
    answer: roundData.answer.toString(),
    updatedAt: new Date(Number(roundData.updatedAt) * 1000).toISOString(),
  });
  console.log("healthCheck:", { isHealthy, secondsSinceUpdate: secondsSinceUpdate.toString() });
  console.log("authorized sender:", authorized);
}

main().catch((err) => {
  console.error("Error querying FeedProxy:", err);
  process.exit(1);
});

