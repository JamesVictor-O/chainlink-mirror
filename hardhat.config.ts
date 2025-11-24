import hardhatToolboxViemPlugin from "@nomicfoundation/hardhat-toolbox-viem";
import { configVariable, defineConfig } from "hardhat/config";
import * as dotenv from "dotenv";
import { defineChain } from "viem";

// Load environment variables from .env.local or .env
dotenv.config({ path: ".env.local" });
dotenv.config(); // Also try .env as fallback

// Define custom chains for Reactive Network
const reactiveMainnet = defineChain({
  id: 1597,
  name: "Reactive Mainnet",
  nativeCurrency: {
    decimals: 18,
    name: "Ether",
    symbol: "ETH",
  },
  rpcUrls: {
    default: {
      http: ["https://rpc.reactive.network"],
    },
  },
  blockExplorers: {
    default: {
      name: "Reactscan",
      url: "https://reactscan.io",
    },
  },
});

const reactiveTestnet = defineChain({
  id: 5318007,
  name: "Lasna Testnet",
  nativeCurrency: {
    decimals: 18,
    name: "Ether",
    symbol: "ETH",
  },
  rpcUrls: {
    default: {
      http: ["https://lasna-rpc.rnk.dev"],
    },
  },
  blockExplorers: {
    default: {
      name: "Reactscan Lasna",
      url: "https://lasna.reactscan.io",
    },
  },
});

export default defineConfig({
  plugins: [hardhatToolboxViemPlugin],
  solidity: {
    profiles: {
      default: {
        version: "0.8.28",
      },
      production: {
        version: "0.8.28",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    },
  },
  paths: {
    sources: "./contracts",
    cache: "./cache",
    artifacts: "./artifacts",
  },
  networks: {
    hardhatMainnet: {
      type: "edr-simulated",
      chainType: "l1",
    },
    hardhatOp: {
      type: "edr-simulated",
      chainType: "op",
    },
    sepolia: {
      type: "http",
      chainType: "l1",
      url: configVariable("SEPOLIA_RPC_URL"),
      accounts: [configVariable("SEPOLIA_PRIVATE_KEY")],
    },
    reactiveMainnet: {
      type: "http",
      chainType: "l1",
      url:
        process.env.REACTIVE_MAINNET_RPC_URL || "https://rpc.reactive.network",
      accounts: process.env.REACTIVE_PRIVATE_KEY
        ? [process.env.REACTIVE_PRIVATE_KEY]
        : [],
      chainId: 1597,
    },
    reactiveTestnet: {
      type: "http",
      chainType: "l1",
      url: process.env.REACTIVE_TESTNET_RPC_URL || "https://lasna-rpc.rnk.dev",
      accounts: process.env.REACTIVE_PRIVATE_KEY
        ? [process.env.REACTIVE_PRIVATE_KEY]
        : [],
      chainId: 5318007,
    },
    // Alias for convenience
    reactive: {
      type: "http",
      chainType: "l1",
      url: process.env.REACTIVE_TESTNET_RPC_URL || "https://lasna-rpc.rnk.dev",
      accounts: process.env.REACTIVE_PRIVATE_KEY
        ? [process.env.REACTIVE_PRIVATE_KEY]
        : [],
      chainId: 5318007,
    },
    lasna: {
      type: "http",
      chainType: "l1",
      url: process.env.REACTIVE_TESTNET_RPC_URL || "https://lasna-rpc.rnk.dev",
      accounts: process.env.REACTIVE_PRIVATE_KEY
        ? [process.env.REACTIVE_PRIVATE_KEY]
        : [],
      chainId: 5318007,
    },
    // BNB Smart Chain Networks
    bnbMainnet: {
      type: "http",
      chainType: "l1",
      url: process.env.BNB_MAINNET_RPC_URL || "https://bsc-dataseed1.binance.org",
      accounts: process.env.BNB_PRIVATE_KEY
        ? [process.env.BNB_PRIVATE_KEY]
        : [],
      chainId: 56,
    },
    bnbTestnet: {
      type: "http",
      chainType: "l1",
      url:
        process.env.BNB_TESTNET_RPC_URL ||
        "https://data-seed-prebsc-1-s1.binance.org:8545",
      accounts: process.env.BNB_PRIVATE_KEY
        ? [process.env.BNB_PRIVATE_KEY]
        : [],
      chainId: 97,
    },
    // Alias for convenience
    bscTestnet: {
      type: "http",
      chainType: "l1",
      url:
        process.env.BNB_TESTNET_RPC_URL ||
        "https://data-seed-prebsc-1-s1.binance.org:8545",
      accounts: process.env.BNB_PRIVATE_KEY
        ? [process.env.BNB_PRIVATE_KEY]
        : [],
      chainId: 97,
    },
  },
});
