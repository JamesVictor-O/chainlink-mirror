# Chainlink Mirror Dashboard

A live, real-time dashboard showing Chainlink price feeds mirrored across chains using Reactive Network.

## Features

- 🔴 **Live Data**: Real-time price feeds from both origin and destination chains
- 📊 **Price Comparison**: Side-by-side comparison with deviation calculation
- 🏥 **Health Monitoring**: Status indicators for feed health
- ⚡ **Auto-refresh**: Updates every 5 seconds automatically
- 🎨 **Modern UI**: Beautiful, responsive design

## Configuration

Edit `src/config.ts` to update:

- Contract addresses
- RPC endpoints
- Chain information
- Refresh intervals

## Current Setup

- **Origin Chain**: Sepolia (Chainlink ETH/USD feed)
- **Destination Chain**: BNB Smart Chain Testnet (FeedProxy)
- **Reactive Network**: Lasna Testnet (ChainlinkFeedReactor)

## Running the Dashboard

```bash
# Install dependencies (if not already done)
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

The dashboard will be available at `http://localhost:5173` (or the port Vite assigns).

## What You'll See

1. **Origin Chain Card**: Live Chainlink price from Sepolia
2. **Destination Chain Card**: Mirrored price from BNB testnet FeedProxy
3. **Deviation**: Real-time price difference percentage
4. **Status Indicators**: Health status for both feeds
5. **System Status**: Overall system health and links to explorers

All data is **100% live** - no dummy data, no mock values. Everything comes directly from the blockchain!
