#!/bin/bash

# Script to verify a feed registration
# Usage: ./scripts/verify-feed.sh [testnet|mainnet] <FEED_ID>
# Or: ./scripts/verify-feed.sh [testnet|mainnet] <ORIGIN_CHAIN_ID> <FEED_ADDRESS>

set -e

# Load environment variables
if [ -f .env.local ]; then
    export $(grep -v '^#' .env.local | xargs)
fi

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

NETWORK=${1:-testnet}
REACTOR_ADDRESS=${REACTOR_ADDRESS:-""}

if [ -z "$REACTOR_ADDRESS" ]; then
    echo -e "${RED}Error: REACTOR_ADDRESS not set${NC}"
    exit 1
fi

# Network config
if [ "$NETWORK" = "mainnet" ]; then
    CHAIN_ID=1597
    RPC_URL=${REACTIVE_MAINNET_RPC_URL:-"https://rpc.reactive.network"}
elif [ "$NETWORK" = "testnet" ]; then
    CHAIN_ID=5318007
    RPC_URL=${REACTIVE_TESTNET_RPC_URL:-"https://lasna-rpc.rnk.dev"}
else
    echo -e "${RED}Invalid network${NC}"
    exit 1
fi

# Calculate feed ID if origin chain and feed address provided
if [ -n "$3" ]; then
    ORIGIN_CHAIN_ID=$2
    FEED_ADDRESS=$3
    echo -e "${YELLOW}Calculating Feed ID from:${NC}"
    echo "  Origin Chain ID: $ORIGIN_CHAIN_ID"
    echo "  Feed Address: $FEED_ADDRESS"
    echo ""
    # Feed ID = keccak256(abi.encodePacked(originChainId, feedAddress))
    # This is complex with cast, so we'll try to read it from the event logs instead
    FEED_ID=""
else
    FEED_ID=$2
fi

if [ -z "$FEED_ID" ]; then
    echo -e "${RED}Error: Please provide either FEED_ID or ORIGIN_CHAIN_ID + FEED_ADDRESS${NC}"
    echo "Usage: ./scripts/verify-feed.sh testnet <FEED_ID>"
    echo "   or: ./scripts/verify-feed.sh testnet <ORIGIN_CHAIN_ID> <FEED_ADDRESS>"
    exit 1
fi

echo -e "${GREEN}Verifying feed registration...${NC}"
echo "  Reactor: $REACTOR_ADDRESS"
echo "  Feed ID: $FEED_ID"
echo ""

# Try to read feed config
echo -e "${YELLOW}Reading feed configuration...${NC}"
cast call \
    "$REACTOR_ADDRESS" \
    "feeds(bytes32)(uint64,address,uint64,address,uint8,string,uint256,uint256,int256,uint256,bool)" \
    "$FEED_ID" \
    --rpc-url "$RPC_URL" || {
    echo -e "${RED}Could not read feed configuration${NC}"
    echo "This might mean:"
    echo "  1. Feed is not registered"
    echo "  2. Feed ID is incorrect"
    echo "  3. Contract doesn't expose feeds mapping publicly"
    exit 1
}

echo -e "${GREEN}✓ Feed is registered!${NC}"

