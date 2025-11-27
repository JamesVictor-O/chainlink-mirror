#!/bin/bash
export PATH=/opt/homebrew/bin:/usr/local/bin:/usr/bin:$PATH
cd /Users/mac/MyWork/chainlink-mirror
source .env.local
/opt/homebrew/bin/npx hardhat run scripts/poll-chainlink-feed.ts --network reactiveTestnet >> /tmp/poll-chainlink.log 2>&1
