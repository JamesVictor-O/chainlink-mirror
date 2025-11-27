#!/bin/bash

# Script to register a feed with ChainlinkFeedReactor using Foundry
# Usage: ./scripts/register-feed.sh [testnet|mainnet]
#
# Required Environment Variables:
#   REACTOR_ADDRESS: ChainlinkFeedReactor contract address
#   ORIGIN_CHAIN_ID: Chain ID where Chainlink feed is (e.g., 11155111 for Sepolia)
#   FEED_ADDRESS: Chainlink aggregator address
#   DESTINATION_CHAIN_ID: Chain ID where FeedProxy is (e.g., 97 for BNB testnet)
#   DESTINATION_PROXY: FeedProxy contract address
#
# Optional Environment Variables:
#   FEED_DECIMALS: Number of decimals (default: 8)
#   FEED_DESCRIPTION: Feed description (default: "ETH/USD")
#   DEVIATION_THRESHOLD: Deviation in basis points (default: 50 = 0.5%)
#   HEARTBEAT: Heartbeat in seconds (default: 3600 = 1 hour)

set -e

# Load environment variables from .env.local if it exists
if [ -f .env.local ]; then
    export $(grep -v '^#' .env.local | xargs)
fi

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Default to testnet if no argument provided
NETWORK=${1:-testnet}

# Network configuration
if [ "$NETWORK" = "mainnet" ]; then
    CHAIN_ID=1597
    RPC_URL=${REACTIVE_MAINNET_RPC_URL:-"https://rpc.reactive.network"}
    NETWORK_NAME="Reactive Mainnet"
    EXPLORER_URL="https://reactscan.io"
elif [ "$NETWORK" = "testnet" ]; then
    CHAIN_ID=5318007
    RPC_URL=${REACTIVE_TESTNET_RPC_URL:-"https://lasna-rpc.rnk.dev"}
    NETWORK_NAME="Lasna Testnet"
    EXPLORER_URL="https://lasna.reactscan.io"
else
    echo -e "${RED}Error: Invalid network. Use 'mainnet' or 'testnet'${NC}"
    exit 1
fi

# Check required environment variables
if [ -z "$REACTOR_ADDRESS" ]; then
    echo -e "${RED}Error: REACTOR_ADDRESS environment variable is not set${NC}"
    echo "Set it with: export REACTOR_ADDRESS=0x..."
    exit 1
fi

if [ -z "$ORIGIN_CHAIN_ID" ]; then
    echo -e "${RED}Error: ORIGIN_CHAIN_ID environment variable is not set${NC}"
    echo "Example: export ORIGIN_CHAIN_ID=11155111 (Sepolia)"
    exit 1
fi

if [ -z "$FEED_ADDRESS" ]; then
    echo -e "${RED}Error: FEED_ADDRESS environment variable is not set${NC}"
    echo "Example: export FEED_ADDRESS=0x694AA1769357215DE4FAC081bf1f309aDC325306"
    exit 1
fi

if [ -z "$DESTINATION_CHAIN_ID" ]; then
    echo -e "${RED}Error: DESTINATION_CHAIN_ID environment variable is not set${NC}"
    echo "Example: export DESTINATION_CHAIN_ID=97 (BNB testnet)"
    exit 1
fi

if [ -z "$DESTINATION_PROXY" ]; then
    echo -e "${RED}Error: DESTINATION_PROXY environment variable is not set${NC}"
    echo "Set it with: export DESTINATION_PROXY=0x..."
    exit 1
fi

if [ -z "$REACTIVE_PRIVATE_KEY" ]; then
    echo -e "${RED}Error: REACTIVE_PRIVATE_KEY environment variable is not set${NC}"
    echo "Set it with: export REACTIVE_PRIVATE_KEY=your_private_key"
    exit 1
fi

# Optional parameters with defaults
DECIMALS=${FEED_DECIMALS:-8}
DESCRIPTION=${FEED_DESCRIPTION:-"ETH/USD"}
DEVIATION_THRESHOLD=${DEVIATION_THRESHOLD:-50}
HEARTBEAT=${HEARTBEAT:-3600}

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Registering Feed with ChainlinkFeedReactor${NC}"
echo -e "${GREEN}Network: ${NETWORK_NAME}${NC}"
echo -e "${GREEN}Chain ID: ${CHAIN_ID}${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

echo -e "${YELLOW}Registration Parameters:${NC}"
echo "  Reactor Address: $REACTOR_ADDRESS"
echo "  Origin Chain ID: $ORIGIN_CHAIN_ID"
echo "  Feed Address: $FEED_ADDRESS"
echo "  Destination Chain ID: $DESTINATION_CHAIN_ID"
echo "  Destination Proxy: $DESTINATION_PROXY"
echo "  Decimals: $DECIMALS"
echo "  Description: $DESCRIPTION"
echo "  Deviation Threshold: $DEVIATION_THRESHOLD basis points"
echo "  Heartbeat: $HEARTBEAT seconds"
echo ""

# Check if solc is available locally
if command -v solc &> /dev/null; then
    SOLC_VERSION=$(solc --version 2>/dev/null | head -1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)
    SOLC_PATH=$(which solc)
    echo -e "${GREEN}✓ Found local Solidity compiler: $SOLC_VERSION${NC}"
    export SOLC="$SOLC_PATH"
else
    echo -e "${YELLOW}⚠ No local Solidity compiler found. Foundry will try to download it.${NC}"
fi
echo ""

# Use cast to send the transaction
echo -e "${YELLOW}Registering feed...${NC}"

# Function signature
FUNCTION_SIG="registerFeed(uint64,address,uint64,address,uint8,string,uint256,uint256)"

# Send the transaction
TEMP_LOG=$(mktemp)
if cast send \
    "$REACTOR_ADDRESS" \
    "$FUNCTION_SIG" \
    "$ORIGIN_CHAIN_ID" \
    "$FEED_ADDRESS" \
    "$DESTINATION_CHAIN_ID" \
    "$DESTINATION_PROXY" \
    "$DECIMALS" \
    "$DESCRIPTION" \
    "$DEVIATION_THRESHOLD" \
    "$HEARTBEAT" \
    --rpc-url "$RPC_URL" \
    --private-key "$REACTIVE_PRIVATE_KEY" \
    --chain-id "$CHAIN_ID" > "$TEMP_LOG" 2>&1; then
    
    # Extract transaction hash and block number
    TX_HASH=$(grep "transactionHash" "$TEMP_LOG" | awk '{print $2}' | head -1)
    BLOCK_NUMBER=$(grep "blockNumber" "$TEMP_LOG" | awk '{print $2}' | head -1)
    
    # Show only key info
    echo -e "${GREEN}✓ Transaction sent successfully${NC}"
    echo "   Transaction Hash: $TX_HASH"
    echo "   Block Number: $BLOCK_NUMBER"
    echo ""
    
    rm -f "$TEMP_LOG"
    
    echo ""
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}Feed Registered Successfully!${NC}"
    echo -e "${GREEN}========================================${NC}"
    echo ""
    
    # Extract feed ID from transaction receipt (from FeedRegistered event)
    echo -e "${YELLOW}Extracting feed ID from transaction...${NC}"
    RECEIPT_LOG=$(mktemp)
    if cast receipt "$TX_HASH" --rpc-url "$RPC_URL" > "$RECEIPT_LOG" 2>&1; then
        # Feed ID is the first indexed topic in FeedRegistered event
        # Event: FeedRegistered(bytes32 indexed feedId, ...)
        # Look for the event topic (FeedRegistered signature) and extract feedId
        FEED_ID=$(grep -A 2 "FeedRegistered\|0xf4f006a1b27906560cd3478650f7993ae5a7f7677c31400fdb593d493667fedd" "$RECEIPT_LOG" | grep -oE '0x[a-fA-F0-9]{64}' | head -1)
        if [ -n "$FEED_ID" ] && [ "$FEED_ID" != "0xf4f006a1b27906560cd3478650f7993ae5a7f7677c31400fdb593d493667fedd" ]; then
            echo "   Feed ID: $FEED_ID"
        else
            # Calculate feed ID manually: keccak256(abi.encodePacked(originChainId, feedAddress))
            echo "   Calculating Feed ID from parameters..."
            echo "   Feed ID = keccak256(abi.encodePacked($ORIGIN_CHAIN_ID, $FEED_ADDRESS))"
            echo "   (You can verify this matches the event in the transaction logs)"
        fi
    fi
    rm -f "$RECEIPT_LOG"
    echo ""
    
    echo -e "${YELLOW}Transaction Details:${NC}"
    echo "   Transaction Hash: $TX_HASH"
    echo "   Block Number: $BLOCK_NUMBER"
    echo "   View on explorer: ${EXPLORER_URL}/tx/${TX_HASH}"
    echo ""
    echo -e "${YELLOW}The reactor will now automatically:${NC}"
    echo "  - Monitor Chainlink AnswerUpdated events on chain $ORIGIN_CHAIN_ID"
    echo "  - Forward updates when price deviates by $DEVIATION_THRESHOLD basis points"
    echo "  - Forward updates when heartbeat expires ($HEARTBEAT seconds)"
    echo ""
    echo -e "${YELLOW}View reactor on explorer:${NC}"
    echo "  ${EXPLORER_URL}/address/${REACTOR_ADDRESS}"
    echo ""
else
    DEPLOY_EXIT_CODE=$?
    DEPLOY_OUTPUT=$(cat "$TEMP_LOG")
    rm -f "$TEMP_LOG"
    echo "$DEPLOY_OUTPUT"
    echo ""
    echo -e "${RED}========================================${NC}"
    echo -e "${RED}Registration Failed${NC}"
    echo -e "${RED}========================================${NC}"
    echo ""
    exit 1
fi

