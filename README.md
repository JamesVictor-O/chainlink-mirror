# Chainlink Mirror – Cross-Chain Oracle Solution for Reactive Network

## Overview

Chainlink Mirror is a cross-chain price feed solution built to demonstrate how a **cron-driven poll** and **reactive contracts** can mirror a canonical Chainlink feed onto another chain that lacks native coverage.  
We pull `latestRoundData()` from Sepolia, run the reactor's deviation/heartbeat logic (`pollFeed()`), and—when an update is warranted—write the data directly to a BNB Testnet `FeedProxy` that exposes `AggregatorV3Interface`.  
This delivers an on-chain, audit-friendly mirror without relying on centralized relayers or off-chain automation.

---

## Context: Why This Matters

Reactive Network’s goal is to **replace off-chain automation systems** (like Chainlink Automation) with fully on-chain reactive contracts.

- **Traditional Approach (Chainlink):** Off-chain oracles detect events → call contracts → trigger actions.
- **Reactive Approach:** Contracts themselves react to events emitted by other contracts or chains in real-time.

By implementing cross-chain oracle mirroring, this project serves as a **real-world demonstration** of Reactive Network’s automation capabilities and provides a robust example for developers to learn from.

---

## Flow Overview

1. **Origin chain (Sepolia)**
   - Cron job reads `latestRoundData()` from the official Chainlink ETH/USD feed.
   - Captures `roundId`, `answer`, `updatedAt`, `answeredInRound`, etc.
2. **Reactive decision engine (Lasna)**
   - The call goes to `ChainlinkFeedReactor.pollFeed()`, which enforces deviation/heartbeat thresholds and tracks metrics (`totalEventsReceived`, `updatesForwarded/skipped`).
   - It returns whether the current round should be forwarded to the destination.
3. **Destination chain (BNB Testnet FeedProxy)**
   - If the reactor says “forward,” the cron job calls `FeedProxy.updateRoundData(...)` directly with the same parameters.
   - FeedProxy stores the round data and implements `latestRoundData()` so consumers can read it like a native Chainlink feed.
4. **Applications**
   - Read from `FeedProxy.latestRoundData()` and consume a mirrored, AggregatorV3-compatible price.

### Architecture Diagram

```
 Sepolia Chainlink Feed
     └──> Cron job (`poll-chainlink-feed.ts`)
             └──> `reactor.pollFeed()`
                     ├─> decides whether to forward
                     └─> tracks metrics (`FeedConfig`, `FeedMetrics`)
                             if forward:
                             └──> BNB FeedProxy (`updateRoundData()`)
                                     └──> AggregatorV3 data for frontend/dApps
```

## Features

- **Cron-driven polling pipeline**  
  Polls Sepolia's feed on a schedule, runs deviation/heartbeat logic in `pollFeed()`, and decides when to mirror the update.
- **ChainlinkFeedReactor (Reactive Smart Contract)**  
  Tracks configuration/metrics and acts as the authority for forwarding decisions.
- **FeedProxy Contract**  
  Stores the mirrored round data and exposes `latestRoundData()` so BNB apps can consume it.
- **Proof-of-worked example**  
  Includes a Foundry smoke test to simulate the full pipeline and a React dashboard to visualize the origin/destination data.

---

## Technical Architecture

### Contracts

1. **FeedProxy (Destination Chain)**

   - Stores the mirrored round data and exposes `latestRoundData()`.
   - Implements `AggregatorV3Interface` so downstream apps can consume it unchanged.

2. **ChainlinkFeedReactor (Reactive Decision Engine)**
   - `pollFeed()` checks deviation, heartbeat, and metrics.
   - The cron script calls `pollFeed()` to decide whether to forward.
   - It keeps `FeedConfig` + `FeedMetrics` so you can audit how many updates were skipped or forwarded.

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
git clone https://github.com/JamesVictor-0/chainlink-mirror.git
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
