#!/bin/bash

# Deployment script for FeedProxy on BNB Smart Chain Testnet
# Usage: ./scripts/deploy-bnb-testnet.sh [testnet|mainnet]

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
    CHAIN_ID=56
    # Try multiple RPC endpoints for mainnet
    if [ -n "$BNB_MAINNET_RPC_URL" ]; then
        RPC_URL="$BNB_MAINNET_RPC_URL"
    else
        RPC_URL="https://bsc-dataseed1.binance.org"
    fi
    NETWORK_NAME="BNB Smart Chain Mainnet"
    EXPLORER_URL="https://bscscan.com"
elif [ "$NETWORK" = "testnet" ]; then
    CHAIN_ID=97
    # List of alternative RPC endpoints to try (defined here for use later)
    RPC_ENDPOINTS=(
        "https://bsc-testnet.publicnode.com"
        "https://bsc-testnet-rpc.publicnode.com"
        "https://data-seed-prebsc-2-s1.binance.org:8545"
        "https://data-seed-prebsc-1-s1.binance.org:8545"
        "https://data-seed-prebsc-1-s2.binance.org:8545"
    )
    # Try multiple RPC endpoints for testnet
    if [ -n "$BNB_TESTNET_RPC_URL" ]; then
        RPC_URL="$BNB_TESTNET_RPC_URL"
    else
        RPC_URL="${RPC_ENDPOINTS[0]}"
    fi
    NETWORK_NAME="BNB Smart Chain Testnet"
    EXPLORER_URL="https://testnet.bscscan.com"
else
    echo -e "${RED}Error: Invalid network. Use 'mainnet' or 'testnet'${NC}"
    exit 1
fi

# Check required environment variables
if [ -z "$BNB_PRIVATE_KEY" ]; then
    echo -e "${RED}Error: BNB_PRIVATE_KEY environment variable is not set${NC}"
    echo "Please set it with: export BNB_PRIVATE_KEY=your_private_key"
    echo "Or add it to your .env.local file"
    exit 1
fi

# Contract path
CONTRACT_PATH="contracts/destination/FeedProxy.sol:FeedProxy"

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Deploying FeedProxy to BNB Smart Chain${NC}"
echo -e "${GREEN}Network: ${NETWORK_NAME}${NC}"
echo -e "${GREEN}Chain ID: ${CHAIN_ID}${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# Check if solc is available locally and configure Foundry to use it
if command -v solc &> /dev/null; then
    SOLC_VERSION=$(solc --version 2>/dev/null | head -1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)
    SOLC_PATH=$(which solc)
    echo -e "${GREEN}✓ Found local Solidity compiler: $SOLC_VERSION${NC}"
    echo -e "${GREEN}  Path: $SOLC_PATH${NC}"
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

# Deploy contract
echo -e "${YELLOW}Deploying FeedProxy contract with Foundry...${NC}"
echo ""
echo -e "${YELLOW}Note: FeedProxy constructor requires:${NC}"
echo "  - decimals (uint8): e.g., 8 for price feeds"
echo "  - description (string): e.g., 'ETH/USD'"
echo "  - heartbeat (uint256): e.g., 3600 (1 hour in seconds)"
echo ""
echo -e "${YELLOW}You'll need to provide these as constructor arguments.${NC}"
echo -e "${YELLOW}For now, deploying with example values...${NC}"
echo ""

# Example constructor arguments
# You can modify these or pass them as environment variables
DECIMALS=${FEEDPROXY_DECIMALS:-8}
DESCRIPTION=${FEEDPROXY_DESCRIPTION:-"ETH/USD"}
HEARTBEAT=${FEEDPROXY_HEARTBEAT:-3600}

# Debug: Print contract path and RPC URL
echo -e "${YELLOW}Contract path: ${CONTRACT_PATH}${NC}"
echo -e "${YELLOW}RPC URL: ${RPC_URL}${NC}"
echo ""

# Function to try deployment with a specific RPC URL
try_deploy() {
    local rpc_url=$1
    local temp_log=$(mktemp)
    
    echo -e "${YELLOW}Trying RPC: ${rpc_url}${NC}"
    
    if forge create \
        "$CONTRACT_PATH" \
        --rpc-url "$rpc_url" \
        --private-key "$BNB_PRIVATE_KEY" \
        --broadcast \
        --constructor-args "$DECIMALS" "$DESCRIPTION" "$HEARTBEAT" > "$temp_log" 2>&1; then
        cat "$temp_log"
        rm -f "$temp_log"
        return 0
    else
        local exit_code=$?
        local output=$(cat "$temp_log")
        rm -f "$temp_log"
        
        # Check if it's an RPC error (503, 429, connection issues)
        if echo "$output" | grep -qE "HTTP error (503|429|502|504)|Unable to complete request|Connection|timeout|Max retries exceeded"; then
            echo -e "${YELLOW}⚠ RPC endpoint unavailable, will try alternative...${NC}"
            return 1
        else
            # Other error - show it
            echo "$output"
            return 2
        fi
    fi
}

# Use a temp file to capture output and check exit code
TEMP_LOG=$(mktemp)
DEPLOY_SUCCESS=false

# For testnet, always try multiple endpoints (custom first, then fallbacks)
if [ "$NETWORK" = "testnet" ]; then
    echo -e "${YELLOW}Trying RPC endpoints (will try fallbacks if needed)...${NC}"
    echo ""
    
    # Build list of RPCs to try: custom first (if set), then fallbacks
    RPC_LIST=()
    if [ -n "$BNB_TESTNET_RPC_URL" ]; then
        RPC_LIST+=("$BNB_TESTNET_RPC_URL")
        echo -e "${YELLOW}Will try custom RPC first, then fallback endpoints...${NC}"
    fi
    # Add fallback endpoints
    RPC_LIST+=("${RPC_ENDPOINTS[@]}")
    
    for rpc in "${RPC_LIST[@]}"; do
        if try_deploy "$rpc"; then
            DEPLOY_SUCCESS=true
            break
        fi
        echo ""
    done
    
    if [ "$DEPLOY_SUCCESS" = false ]; then
        echo -e "${RED}========================================${NC}"
        echo -e "${RED}All RPC endpoints failed${NC}"
        echo -e "${RED}========================================${NC}"
        echo ""
        echo -e "${YELLOW}Possible solutions:${NC}"
        echo "1. Wait a few minutes and try again (RPC may be temporarily overloaded)"
        echo "2. Check your custom RPC URL if you set BNB_TESTNET_RPC_URL"
        echo "3. Try using a different RPC provider (Alchemy, Infura, QuickNode, etc.)"
        echo ""
        echo -e "${YELLOW}Example custom RPC URL:${NC}"
        echo "  export BNB_TESTNET_RPC_URL=https://bsc-testnet.publicnode.com"
        echo ""
        exit 1
    fi
else
    # Mainnet: try custom RPC first, then fallback to default
    if try_deploy "$RPC_URL"; then
        DEPLOY_SUCCESS=true
    else
        DEPLOY_EXIT_CODE=$?
        if [ $DEPLOY_EXIT_CODE -eq 1 ]; then
            echo -e "${RED}========================================${NC}"
            echo -e "${RED}RPC endpoint unavailable${NC}"
            echo -e "${RED}========================================${NC}"
            echo ""
            echo -e "${YELLOW}The RPC endpoint is currently unavailable.${NC}"
            echo "Please try again in a few minutes or use a different RPC URL."
            echo ""
            exit 1
        else
            echo -e "${RED}========================================${NC}"
            echo -e "${RED}Deployment Failed${NC}"
            echo -e "${RED}========================================${NC}"
            echo ""
            echo -e "${YELLOW}Check the error message above for details.${NC}"
            echo ""
            exit 1
        fi
    fi
fi

# Only show success message if deployment succeeded
if [ "$DEPLOY_SUCCESS" = true ]; then
    echo ""
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}Deployment Complete!${NC}"
    echo -e "${GREEN}========================================${NC}"
    echo ""
    echo -e "${YELLOW}Next Steps:${NC}"
    echo "1. Save the deployed contract address"
    echo "2. Verify the contract on BscScan:"
    echo "   ${EXPLORER_URL}"
    echo "3. Add authorized sender (your ChainlinkFeedReactor address)"
    echo "4. Test the feed by calling updateRoundData()"
    echo ""
    echo -e "${YELLOW}To customize deployment, set these environment variables:${NC}"
    echo "  FEEDPROXY_DECIMALS=8"
    echo "  FEEDPROXY_DESCRIPTION='ETH/USD'"
    echo "  FEEDPROXY_HEARTBEAT=3600"
    echo ""
fi


