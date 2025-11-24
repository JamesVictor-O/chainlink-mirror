import { useEffect, useState } from "react";
import { ethers } from "ethers";
import FeedProxyAbi from "./abis/FeedProxy.json";
import AggregatorV3Abi from "./abis/AggregatorV3Interface.json";
import { CONFIG } from "./config";
import "./Dashboard.css";

interface PriceData {
  price: string;
  roundId: string;
  updatedAt: number;
  decimals: number;
  description: string;
  isHealthy: boolean;
  timeSinceUpdate: number;
}

export default function Dashboard() {
  const [originData, setOriginData] = useState<PriceData | null>(null);
  const [destinationData, setDestinationData] = useState<PriceData | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  const fetchOriginData = async () => {
    const rpcUrls = (
      CONFIG.ORIGIN_CHAIN as { rpcUrls?: string[]; rpcUrl?: string }
    ).rpcUrls || [
      (CONFIG.ORIGIN_CHAIN as { rpcUrl?: string }).rpcUrl ||
        "https://rpc.sepolia.org",
    ];
    let lastError: Error | null = null;

    for (const rpcUrl of rpcUrls) {
      try {
        const provider = new ethers.JsonRpcProvider(rpcUrl, {
          name: CONFIG.ORIGIN_CHAIN.name,
          chainId: CONFIG.ORIGIN_CHAIN.chainId,
        });

        const contract = new ethers.Contract(
          CONFIG.ORIGIN_CHAIN.feedAddress,
          AggregatorV3Abi.abi,
          provider
        );

        const [roundData, decimals, description] = await Promise.all([
          contract.latestRoundData(),
          contract.decimals(),
          contract.description(),
        ]);

        const price = ethers.formatUnits(roundData.answer, decimals);
        const updatedAt = Number(roundData.updatedAt);

        setOriginData({
          price,
          roundId: roundData.roundId.toString(),
          updatedAt,
          decimals: Number(decimals),
          description,
          isHealthy: true,
          timeSinceUpdate: Math.floor(Date.now() / 1000) - updatedAt,
        });
        return; // Success, exit function
      } catch (err) {
        console.error(`Error with RPC ${rpcUrl}:`, err);
        lastError = err instanceof Error ? err : new Error(String(err));
        continue; // Try next RPC
      }
    }

    // All RPCs failed
    const errorMsg = lastError?.message || "All RPC endpoints failed";
    setError(`Failed to fetch origin chain data: ${errorMsg}`);
  };

  const fetchDestinationData = async () => {
    const rpcUrls = (
      CONFIG.DESTINATION_CHAIN as { rpcUrls?: string[]; rpcUrl?: string }
    ).rpcUrls || [
      (CONFIG.DESTINATION_CHAIN as { rpcUrl?: string }).rpcUrl ||
        "https://bsc-testnet.publicnode.com",
    ];
    let lastError: Error | null = null;

    for (const rpcUrl of rpcUrls) {
      try {
        const provider = new ethers.JsonRpcProvider(rpcUrl, {
          name: CONFIG.DESTINATION_CHAIN.name,
          chainId: CONFIG.DESTINATION_CHAIN.chainId,
        });

        const contract = new ethers.Contract(
          CONFIG.DESTINATION_CHAIN.feedProxyAddress,
          FeedProxyAbi.abi,
          provider
        );

        const [roundData, decimals, description, healthCheck] =
          await Promise.all([
            contract.latestRoundData().catch((e: unknown) => {
              console.error("Error calling latestRoundData:", e);
              return null;
            }),
            contract.decimals().catch((e: unknown) => {
              console.error("Error calling decimals:", e);
              return 8; // Default
            }),
            contract.description().catch((e: unknown) => {
              console.error("Error calling description:", e);
              return "N/A";
            }),
            contract.healthCheck().catch((e: unknown) => {
              console.error("Error calling healthCheck:", e);
              return [false, 999999, false];
            }),
          ]);

        if (!roundData || roundData.answer === undefined) {
          setDestinationData({
            price: "0",
            roundId: "0",
            updatedAt: 0,
            decimals: Number(decimals),
            description: description || "N/A",
            isHealthy: false,
            timeSinceUpdate: 999999,
          });
          return; // Success, exit function
        }

        const price = ethers.formatUnits(roundData.answer, Number(decimals));
        const updatedAt = Number(roundData.updatedAt);
        const [isHealthy, secondsSinceUpdate] = healthCheck;

        setDestinationData({
          price,
          roundId: roundData.roundId.toString(),
          updatedAt,
          decimals: Number(decimals),
          description: description || "N/A",
          isHealthy: isHealthy as boolean,
          timeSinceUpdate: Number(secondsSinceUpdate),
        });
        return; // Success, exit function
      } catch (err) {
        console.error(`Error with RPC ${rpcUrl}:`, err);
        lastError = err instanceof Error ? err : new Error(String(err));
        continue; // Try next RPC
      }
    }

    // All RPCs failed
    const errorMsg = lastError?.message || "All RPC endpoints failed";
    setError(`Failed to fetch destination chain data: ${errorMsg}`);
  };

  const fetchAllData = async () => {
    setLoading(true);
    setError(null);
    await Promise.all([fetchOriginData(), fetchDestinationData()]);
    setLastUpdate(new Date());
    setLoading(false);
  };

  useEffect(() => {
    // Initial fetch
    fetchAllData();

    // Set up interval for auto-refresh
    const interval = setInterval(() => {
      fetchAllData();
    }, CONFIG.REFRESH_INTERVAL);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const formatTime = (seconds: number) => {
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    return `${Math.floor(seconds / 3600)}h ago`;
  };

  const calculateDeviation = () => {
    if (
      !originData ||
      !destinationData ||
      originData.price === "0" ||
      destinationData.price === "0"
    ) {
      return null;
    }
    const origin = parseFloat(originData.price);
    const destination = parseFloat(destinationData.price);
    const deviation = ((destination - origin) / origin) * 100;
    return deviation;
  };

  const deviation = calculateDeviation();

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h1>🔗 Chainlink Mirror Dashboard</h1>
        <p className="subtitle">Live cross-chain price feed monitoring</p>
        <div className="last-update">
          Last updated: {lastUpdate.toLocaleTimeString()}
          {loading && <span className="loading-spinner"> ⟳</span>}
        </div>
      </header>

      {error && <div className="error-banner">⚠️ {error}</div>}

      <div className="chains-container">
        {/* Origin Chain Card */}
        <div className="chain-card origin">
          <div className="chain-header">
            <h2>📍 Origin Chain</h2>
            <span className="chain-badge">{CONFIG.ORIGIN_CHAIN.name}</span>
          </div>
          <div className="chain-info">
            <a
              href={`${CONFIG.ORIGIN_CHAIN.explorer}/address/${CONFIG.ORIGIN_CHAIN.feedAddress}`}
              target="_blank"
              rel="noopener noreferrer"
              className="address-link"
            >
              {CONFIG.ORIGIN_CHAIN.feedAddress.slice(0, 6)}...
              {CONFIG.ORIGIN_CHAIN.feedAddress.slice(-4)}
            </a>
          </div>
          {originData ? (
            <>
              <div className="price-display">
                <div className="price-label">{originData.description}</div>
                <div className="price-value">
                  $
                  {parseFloat(originData.price).toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </div>
              </div>
              <div className="metrics">
                <div className="metric">
                  <span className="metric-label">Round ID:</span>
                  <span className="metric-value">{originData.roundId}</span>
                </div>
                <div className="metric">
                  <span className="metric-label">Last Update:</span>
                  <span className="metric-value">
                    {formatTime(originData.timeSinceUpdate)}
                  </span>
                </div>
                <div className="metric">
                  <span className="metric-label">Status:</span>
                  <span
                    className={`status-badge ${
                      originData.isHealthy ? "healthy" : "unhealthy"
                    }`}
                  >
                    {originData.isHealthy ? "✓ Healthy" : "✗ Unhealthy"}
                  </span>
                </div>
              </div>
            </>
          ) : (
            <div className="loading-state">Loading...</div>
          )}
        </div>

        {/* Comparison Arrow */}
        <div className="comparison-arrow">
          <div className="arrow">→</div>
          {deviation !== null && (
            <div
              className={`deviation ${
                Math.abs(deviation) < 0.1
                  ? "good"
                  : Math.abs(deviation) < 1
                  ? "warning"
                  : "bad"
              }`}
            >
              {deviation > 0 ? "+" : ""}
              {deviation.toFixed(3)}%
            </div>
          )}
        </div>

        {/* Destination Chain Card */}
        <div className="chain-card destination">
          <div className="chain-header">
            <h2>🎯 Destination Chain</h2>
            <span className="chain-badge">{CONFIG.DESTINATION_CHAIN.name}</span>
          </div>
          <div className="chain-info">
            <a
              href={`${CONFIG.DESTINATION_CHAIN.explorer}/address/${CONFIG.DESTINATION_CHAIN.feedProxyAddress}`}
              target="_blank"
              rel="noopener noreferrer"
              className="address-link"
            >
              {CONFIG.DESTINATION_CHAIN.feedProxyAddress.slice(0, 6)}...
              {CONFIG.DESTINATION_CHAIN.feedProxyAddress.slice(-4)}
            </a>
          </div>
          {destinationData ? (
            <>
              <div className="price-display">
                <div className="price-label">{destinationData.description}</div>
                <div className="price-value">
                  $
                  {parseFloat(destinationData.price).toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </div>
              </div>
              <div className="metrics">
                <div className="metric">
                  <span className="metric-label">Round ID:</span>
                  <span className="metric-value">
                    {destinationData.roundId}
                  </span>
                </div>
                <div className="metric">
                  <span className="metric-label">Last Update:</span>
                  <span className="metric-value">
                    {formatTime(destinationData.timeSinceUpdate)}
                  </span>
                </div>
                <div className="metric">
                  <span className="metric-label">Status:</span>
                  <span
                    className={`status-badge ${
                      destinationData.isHealthy ? "healthy" : "unhealthy"
                    }`}
                  >
                    {destinationData.isHealthy ? "✓ Healthy" : "✗ Unhealthy"}
                  </span>
                </div>
              </div>
            </>
          ) : (
            <div className="loading-state">Loading...</div>
          )}
        </div>
      </div>

      {/* System Status */}
      <div className="system-status">
        <h3>System Status</h3>
        <div className="status-grid">
          <div className="status-item">
            <span className="status-label">Reactive Network:</span>
            <a
              href={`${CONFIG.REACTIVE_NETWORK.explorer}/address/${CONFIG.REACTIVE_NETWORK.reactorAddress}`}
              target="_blank"
              rel="noopener noreferrer"
              className="status-link"
            >
              {CONFIG.REACTIVE_NETWORK.reactorAddress.slice(0, 8)}...
            </a>
          </div>
          <div className="status-item">
            <span className="status-label">Refresh Rate:</span>
            <span className="status-value">
              {CONFIG.REFRESH_INTERVAL / 1000}s
            </span>
          </div>
          <div className="status-item">
            <span className="status-label">Price Sync:</span>
            <span
              className={`status-value ${
                deviation !== null && Math.abs(deviation) < 0.1
                  ? "synced"
                  : "out-of-sync"
              }`}
            >
              {deviation !== null
                ? Math.abs(deviation) < 0.1
                  ? "✓ Synced"
                  : "⚠ Out of sync"
                : "—"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
