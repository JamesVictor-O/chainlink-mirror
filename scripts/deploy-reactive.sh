#!/bin/bash

# Deployment script for ChainlinkFeedReactor on Reactive Network
# Usage: ./scripts/deploy-reactive.sh [mainnet|testnet]

# Don't use set -e here because we need to handle errors manually
# set -e

# Load environment variables from .env.local if it exists
if [ -f .env.local ]; then
    set -a
    source .env.local
    set +a
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
elif [ "$NETWORK" = "testnet" ]; then
    CHAIN_ID=5318007
    RPC_URL=${REACTIVE_TESTNET_RPC_URL:-"https://lasna-rpc.rnk.dev"}
    NETWORK_NAME="Lasna Testnet"
else
    echo -e "${RED}Error: Invalid network. Use 'mainnet' or 'testnet'${NC}"
    exit 1
fi

# Check required environment variables
if [ -z "$REACTIVE_PRIVATE_KEY" ]; then
    echo -e "${RED}Error: REACTIVE_PRIVATE_KEY environment variable is not set${NC}"
    echo "Please set it with: export REACTIVE_PRIVATE_KEY=your_private_key"
    exit 1
fi

# Contract path and system contract address
CONTRACT_PATH="contracts/reactive/ChainlinkFeedReactor.sol:ChainlinkFeedReactor"
SYSTEM_CONTRACT="0x0000000000000000000000000000000000fffFfF"

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Deploying ChainlinkFeedReactor${NC}"
echo -e "${GREEN}Network: ${NETWORK_NAME}${NC}"
echo -e "${GREEN}Chain ID: ${CHAIN_ID}${NC}"
echo -e "${GREEN}System Contract: ${SYSTEM_CONTRACT}${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# Check if solc is available locally and configure Foundry to use it
if command -v solc &> /dev/null; then
    SOLC_VERSION=$(solc --version 2>/dev/null | head -1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)
    SOLC_PATH=$(which solc)
    echo -e "${GREEN}✓ Found local Solidity compiler: $SOLC_VERSION${NC}"
    echo -e "${GREEN}  Path: $SOLC_PATH${NC}"
    # Set SOLC environment variable to tell Foundry to use local compiler
    export SOLC="$SOLC_PATH"
    echo -e "${GREEN}  Configured Foundry to use local compiler${NC}"
else
    echo -e "${YELLOW}⚠ No local Solidity compiler found. Foundry will try to download it.${NC}"
    echo -e "${YELLOW}  Install locally with: brew install solidity${NC}"
fi
echo ""

# Compile with Hardhat first (helps ensure contracts are valid)
echo -e "${YELLOW}Compiling contracts with Hardhat...${NC}"
npx hardhat compile || {
    echo -e "${RED}Compilation failed. Please check your network connection.${NC}"
    exit 1
}

# Deploy contract with verification
echo -e "${YELLOW}Deploying contract with Foundry...${NC}"
echo ""

# Try deployment - Foundry will compile again but may use cached compiler
# Use a temp file to capture output and check exit code
TEMP_LOG=$(mktemp)
# Deploy without verification first (verification can be done separately)
if forge create \
    "$CONTRACT_PATH" \
    --rpc-url "$RPC_URL" \
    --private-key "$REACTIVE_PRIVATE_KEY" \
    --chain "$CHAIN_ID" \
    --constructor-args "$SYSTEM_CONTRACT" \
    --broadcast \
    > "$TEMP_LOG" 2>&1; then
    # Success - show output and continue
    cat "$TEMP_LOG"
    rm -f "$TEMP_LOG"
else
    # Failed - show output and handle error
    DEPLOY_EXIT_CODE=$?
    DEPLOY_OUTPUT=$(cat "$TEMP_LOG")
    rm -f "$TEMP_LOG"
    echo "$DEPLOY_OUTPUT"
    echo ""
    
    if echo "$DEPLOY_OUTPUT" | grep -q "error sending request\|Operation timed out\|Connect"; then
        echo -e "${RED}========================================${NC}"
        echo -e "${RED}Network Error: Cannot download Solidity compiler${NC}"
        echo -e "${RED}========================================${NC}"
        echo ""
        echo -e "${YELLOW}Quick Fix - Install Solidity compiler locally:${NC}"
        echo "  brew install solidity"
        echo ""
        echo -e "${YELLOW}After installing, verify it works:${NC}"
        echo "  solc --version"
        echo ""
        echo -e "${YELLOW}Then run the deployment script again.${NC}"
        echo ""
        exit 1
    else
        # Other deployment error
        echo -e "${RED}========================================${NC}"
        echo -e "${RED}Deployment Failed${NC}"
        echo -e "${RED}========================================${NC}"
        echo ""
        echo -e "${YELLOW}Check the error message above for details.${NC}"
        echo ""
        exit 1
    fi
fi

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Deployment Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "${YELLOW}Next Steps:${NC}"
echo "1. Save the deployed contract address"
echo "2. Verify the contract on Reactscan:"
if [ "$NETWORK" = "mainnet" ]; then
    echo "   https://reactscan.io"
else
    echo "   https://lasna.reactscan.io"
fi
echo "3. Register feeds using the registerFeed() function"
echo ""
echo -e "${YELLOW}Example feed registration:${NC}"
echo "  - originChainId: 11155111 (Sepolia)"
echo "  - feedAddress: Chainlink aggregator address"
echo "  - destinationChainId: Target chain ID"
echo "  - destinationProxy: FeedProxy contract address"
echo ""

