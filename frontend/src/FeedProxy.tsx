import { useEffect, useState } from "react";
import { ethers } from "ethers";
import FeedProxyAbi from "./abis/FeedProxy.json";
import { CONFIG } from "./config";

const FEED_PROXY_ADDRESS = CONFIG.DESTINATION_CHAIN.feedProxyAddress;

export default function FeedProxyViewer() {
  const [price, setPrice] = useState<string>("0");
  const [roundId, setRoundId] = useState<string>("0");
  const [decimals, setDecimals] = useState<number>(8);
  const [description, setDescription] = useState<string>("");

  useEffect(() => {
    const fetchData = async () => {
      if (!(window as any).ethereum) return;

      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const contract = new ethers.Contract(
        FEED_PROXY_ADDRESS,
        FeedProxyAbi.abi,
        provider
      );

      try {
        const data = await contract.latestRoundData();
        setRoundId(data[0].toString());
        const contractDecimals = await contract.decimals();
        setDecimals(contractDecimals);
        const contractDescription = await contract.description();
        setDescription(contractDescription);
        setPrice(ethers.formatUnits(data[1], contractDecimals));
      } catch (e) {
        console.error("Error fetching feed data:", e);
      }
    };

    fetchData();

    const interval = setInterval(fetchData, 10000); // refresh every 10s
    return () => clearInterval(interval);
  }, []);

  const updateFeed = async () => {
    if (!(window as any).ethereum) return;
    const provider = new ethers.BrowserProvider((window as any).ethereum);
    const signer = await provider.getSigner();
    const contract = new ethers.Contract(
      FEED_PROXY_ADDRESS,
      FeedProxyAbi.abi,
      signer
    );

    const now = Math.floor(Date.now() / 1000);
    const tx = await contract.updateData(
      parseInt(roundId) + 1,
      Math.floor(Math.random() * 1000 * 10 ** decimals), // random answer
      now,
      now,
      parseInt(roundId) + 1
    );
    await tx.wait();
    alert("Feed updated!");
  };

  return (
    <div style={{ padding: 20, fontFamily: "Arial" }}>
      <h1>FeedProxy Viewer</h1>
      <p>
        <strong>Description:</strong> {description}
      </p>
      <p>
        <strong>Round ID:</strong> {roundId}
      </p>
      <p>
        <strong>Latest Price:</strong> {price}
      </p>
      <button
        onClick={updateFeed}
        style={{ marginTop: 20, padding: "10px 20px" }}
      >
        Simulate Feed Update
      </button>
    </div>
  );
}
