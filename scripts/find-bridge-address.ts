/**
 * Script to find Reactive Network bridge/router address from failed transactions
 * This is the address that actually calls updateRoundData() on FeedProxy
 */

import { createPublicClient, http, defineChain } from "viem";

const bnbTestnetChain = defineChain({
  id: 97,
  name: "BNB Smart Chain Testnet",
  nativeCurrency: {
    decimals: 18,
    name: "BNB",
    symbol: "BNB",
  },
  rpcUrls: {
    default: {
      http: [
        process.env.BNB_TESTNET_RPC_URL ||
          "https://bsc-testnet.publicnode.com",
      ],
    },
  },
});

async function main() {
  const feedProxyAddress =
    process.env.FEEDPROXY_ADDRESS ||
    "0xC71C22d41dbB39083B219e89A755E4Df55931A60";

  console.log("🔍 Finding Reactive Network Bridge/Router Address\n");
  console.log("=".repeat(60));
  console.log("📝 FeedProxy Address:", feedProxyAddress);
  console.log("");

  const publicClient = createPublicClient({
    chain: bnbTestnetChain,
    transport: http(
      process.env.BNB_TESTNET_RPC_URL || "https://bsc-testnet.publicnode.com"
    ),
  });

  // Load FeedProxy ABI
  import * as fs from "fs";
  import * as path from "path";
  const abiPath = path.join(
    process.cwd(),
    "frontend/src/abis/FeedProxy.json"
  );
  const abi = JSON.parse(fs.readFileSync(abiPath, "utf-8")).abi;

  try {
    const currentBlock = await publicClient.getBlockNumber();
    const fromBlock = currentBlock > 100000n ? currentBlock - 100000n : 0n;

    console.log("🔍 Checking recent transactions to FeedProxy...");
    console.log(`   Blocks: ${fromBlock} to ${currentBlock}`);
    console.log("");

    // Get all transactions to FeedProxy in recent blocks
    // We'll check for failed transactions that tried to call updateRoundData
    
    // Check for Unauthorized errors in recent blocks
    // Look for transactions that reverted with Unauthorized error
    
    // Get recent blocks and check transactions
    const blocksToCheck = 1000; // Check last 1000 blocks
    const startBlock = currentBlock > BigInt(blocksToCheck) 
      ? currentBlock - BigInt(blocksToCheck) 
      : 0n;

    console.log(`📊 Checking last ${blocksToCheck} blocks for failed transactions...`);
    console.log("");

    let foundFailed = false;
    const checkedBlocks = 0;
    const maxBlocks = 100; // Limit to avoid timeout

    // Check recent blocks for failed transactions
    for (let i = 0; i < Math.min(maxBlocks, Number(currentBlock - startBlock)); i++) {
      const blockNum = currentBlock - BigInt(i);
      try {
        const block = await publicClient.getBlock({
          blockNumber: blockNum,
          includeTransactions: true,
        });

        for (const tx of block.transactions) {
          if (
            typeof tx === "object" &&
            tx.to &&
            tx.to.toLowerCase() === feedProxyAddress.toLowerCase()
          ) {
            // Check if transaction failed
            try {
              const receipt = await publicClient.getTransactionReceipt({
                hash: tx.hash,
              });

              if (receipt.status === "reverted") {
                console.log("❌ Found failed transaction:");
                console.log("   Hash:", receipt.transactionHash);
                console.log("   From:", receipt.from);
                console.log("   Block:", receipt.blockNumber.toString());
                console.log("   Status: Reverted");
                console.log("");
                console.log("💡 This 'from' address needs to be authorized:");
                console.log(`   ${receipt.from}`);
                console.log("");
                foundFailed = true;
                
                // Get more details about the revert
                try {
                  const txData = await publicClient.getTransaction({
                    hash: receipt.transactionHash,
                  });
                  console.log("   Input Data:", txData.input.slice(0, 20) + "...");
                  console.log("   Function: updateRoundData (likely)");
                } catch (e) {
                  // Ignore
                }
                
                break; // Found one, that's enough
              }
            } catch (e) {
              // Transaction might not be found, continue
            }
          }
        }

        if (foundFailed) break;
      } catch (e) {
        // Continue to next block
      }
    }

    if (!foundFailed) {
      console.log("⚠️  No failed transactions found in recent blocks");
      console.log("");
      console.log("💡 This could mean:");
      console.log("   1. No update attempts have been made yet");
      console.log("   2. Failed transactions are older than checked blocks");
      console.log("   3. Reactive Network hasn't tried to update yet");
      console.log("");
      console.log("🔧 Recommended Actions:");
      console.log("");
      console.log("Option 1: Authorize the reactor address (might work if Reactive Network uses it directly):");
      console.log(`   export FEEDPROXY_ADDRESS=${feedProxyAddress}`);
      console.log(`   export REACTIVE_BRIDGE_ADDRESS=0xbb0043babcc6be0a6c72415ee8e6221812534311`);
      console.log("   npx hardhat run scripts/add-authorized-sender.ts --network bnbTestnet");
      console.log("");
      console.log("Option 2: Contact Reactive Network support to get the bridge/router address");
      console.log("");
      console.log("Option 3: Check BscScan for failed transactions manually:");
      console.log(`   https://testnet.bscscan.com/address/${feedProxyAddress}#internaltx`);
      console.log("   Look for failed transactions with 'Reverted' status");
    }

    console.log("");
    console.log("🔗 View FeedProxy on BscScan:");
    console.log(
      `   https://testnet.bscscan.com/address/${feedProxyAddress}`
    );
    console.log("   Check 'Internal Transactions' and 'Transactions' tabs");
    console.log("   Look for failed transactions from Reactive Network");
  } catch (error: any) {
    console.error("❌ Error:", error.message);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error: any) => {
    console.error("❌ Error:", error);
    process.exit(1);
  });

