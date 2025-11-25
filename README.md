# Chainlink Mirror – Cross-Chain Oracle Solution for Reactive Network

## Overview

**Chainlink Mirror** is a cross-chain price feed solution built to demonstrate the power of **Reactive Smart Contracts** in EVM-compatible networks.  
It mirrors official Chainlink price feeds from an **origin chain** to a **destination chain**, exposing a `AggregatorV3Interface`-compatible interface for downstream applications.

Unlike traditional Chainlink Automation, this project showcases a fully **on-chain event-driven architecture** using **Reactive Network smart contracts**. This allows automated reactions to cross-chain events without relying on off-chain triggers.

---

## Context: Why This Matters

Reactive Network’s goal is to **replace off-chain automation systems** (like Chainlink Automation) with fully on-chain reactive contracts.

- **Traditional Approach (Chainlink):** Off-chain oracles detect events → call contracts → trigger actions.
- **Reactive Approach:** Contracts themselves react to events emitted by other contracts or chains in real-time.

By implementing cross-chain oracle mirroring, this project serves as a **real-world demonstration** of Reactive Network’s automation capabilities and provides a robust example for developers to learn from.

---

## Flow Overview

Origin Chain (Sepolia)
┌───────────────────────────┐
│ Chainlink ETH/USD Feed │
│ Emits AnswerUpdated event │
└──────────────┬────────────┘
│
▼
Reactive Network (Your RSC)
┌───────────────────────────┐
│ ChainlinkFeedReactor │
│ react() is triggered │
│ Processes and forwards │
└──────────────┬────────────┘
▼
Destination Chain (Base Sepolia)
┌───────────────────────────┐
│ FeedProxy receives update │
│ latestRoundData() updated │
└──────────────┬────────────┘
▼
Applications query price → DeFi logic executed

## Features

- **FeedProxy Contract**  
  Stores round data from the origin chain and exposes `latestRoundData()` for consumption by dApps.

- **ChainlinkFeedReactor (Reactive Smart Contract)**  
  Listens for events from the origin chain feed, processes data, and forwards updates to the destination chain.

- **Minimal React Frontend**  
  Visualizes round data, latest price, and allows simulation of feed updates.

- **Cross-Chain Event Handling**  
  Demonstrates a fully on-chain workflow that reacts automatically to updates from the origin chain.

---

## Technical Architecture

### Contracts

1. **FeedProxy (Destination Chain)**

   - Stores mirrored feed data
   - Implements `AggregatorV3Interface`
   - Provides `latestRoundData()` for apps

2. **ChainlinkFeedReactor (Reactive Smart Contract)**
   ```solidity
   function react(uint256 roundId, int256 answer, uint256 updatedAt) external {
       // Receives event from origin feed
       // Processes and validates data
       // Sends callback to FeedProxy
   }
                             └─────────────────┘
   ```

chainlink-mirror/
├── contracts/ # Solidity contracts
├── scripts/ # Deployment and feed update scripts
├── test/ # Unit and integration tests
├── frontend/ # Minimal React frontend
├── hardhat.config.ts # Hardhat configuration
└── package.json # Project dependencies

---

## Tech Stack

- **Smart Contracts:** Solidity, Hardhat, AggregatorV3Interface
- **Blockchain:** EVM-compatible networks (Ethereum, Polygon, Arbitrum, etc.)
- **Frontend:** React, TypeScript, Ethers.js
- **Testing:** Hardhat + Mocha/Chai

---

## Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/YOUR_USERNAME/chainlink-mirror.git
cd chainlink-mirror

npm install
npx hardhat compile

cd frontend
npm install
npm run dev
```

### 2. Deploy Contracts

#### Deploy ChainlinkFeedReactor to Reactive Network

See the comprehensive deployment guide: [scripts/DEPLOYMENT.md](scripts/DEPLOYMENT.md)

**Quick Start (Hardhat):**

```bash
# Set your private key
export REACTIVE_PRIVATE_KEY=your_private_key_here

# Deploy to testnet
npx hardhat run scripts/deploy.ts --network reactiveTestnet

# Deploy to mainnet
npx hardhat run scripts/deploy.ts --network reactiveMainnet
```

**Alternative (Foundry - Recommended for Production):**

```bash
# Set your private key
export REACTIVE_PRIVATE_KEY=your_private_key_here

# Deploy to testnet
./scripts/deploy-reactive.sh testnet

# Deploy to mainnet
./scripts/deploy-reactive.sh mainnet
```

The deployment scripts will:

- Deploy the contract to Reactive Network
- Provide contract address and explorer links
- (Foundry script) Automatically verify the contract on Sourcify
- Provide next steps for feed registration

#### Deploy FeedProxy to Destination Chain

Deploy FeedProxy to your target destination chain (e.g., Base Sepolia, Arbitrum, etc.):

```bash
npx hardhat run scripts/deploy-feedproxy.ts --network <network>
```
