import { createPublicClient, http } from "viem";
import { bscTestnet } from "viem/chains";
import { Contract } from "ethers";
import FeedProxyAbi from "../frontend/src/abis/FeedProxy.json" assert { type: "json" };

async function main() {
  const client = createPublicClient({
    chain: bscTestnet,
    transport: http("https://bsc-testnet.publicnode.com"),
  });

  const contract = new Contract(
    "0x411fe7b4691733b69bff5b967b1d2dc5dd39e6aa",
    FeedProxyAbi.abi,
    client
  );

  const [roundId, answer, startedAt, updatedAt, answeredInRound] =
    await contract.latestRoundData();
  const [isHealthy, secondsSinceUpdate] = await contract.healthCheck();
  const authorized = await contract.authorizedSenders(
    "0x7FcfD3947A638377c37f445A794c1Ec0590c05f3"
  );

  console.log("FeedProxy latestRoundData:");
  console.log("  roundId:", roundId.toString());
  console.log("  answer:", answer.toString());
  console.log("  updatedAt:", new Date(Number(updatedAt) * 1000).toISOString());
  console.log("  isHealthy:", isHealthy);
  console.log("  secondsSinceUpdate:", secondsSinceUpdate.toString());
  console.log("  authorized reactor:", authorized);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
