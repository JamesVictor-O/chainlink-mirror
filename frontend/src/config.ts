// Configuration for the Chainlink Mirror Dashboard
export const CONFIG = {
  // Origin Chain (Sepolia) - Chainlink Feed
  ORIGIN_CHAIN: {
    name: "Sepolia",
    chainId: 11155111,
    rpcUrls: [
      "https://rpc.sepolia.org",
      "https://ethereum-sepolia-rpc.publicnode.com",
      "https://sepolia.gateway.tenderly.co",
    ],
    explorer: "https://sepolia.etherscan.io",
    feedAddress: "0x694AA1769357215DE4FAC081bf1f309aDC325306", // ETH/USD on Sepolia
  },

  // Destination Chain (BNB Testnet) - FeedProxy
  DESTINATION_CHAIN: {
    name: "BNB Smart Chain Testnet",
    chainId: 97,
    rpcUrls: [
      "https://bsc-testnet.publicnode.com",
      "https://bsc-testnet-rpc.publicnode.com",
      "https://data-seed-prebsc-1-s1.binance.org:8545",
    ],
    explorer: "https://testnet.bscscan.com",
    feedProxyAddress: "0x411fe7b4691733b69bff5b967b1d2dc5dd39e6aa", // Your deployed FeedProxy
  },

  // Reactive Network - ChainlinkFeedReactor
  REACTIVE_NETWORK: {
    name: "Lasna Testnet",
    chainId: 5318007,
    rpcUrl: "https://lasna-rpc.rnk.dev",
    explorer: "https://lasna.reactscan.io",
    reactorAddress: "0x7FcfD3947A638377c37f445A794c1Ec0590c05f3", // Deployed reactor (with pollFeed support)
  },

  // Refresh interval in milliseconds
  REFRESH_INTERVAL: 5000, // 5 seconds
};
