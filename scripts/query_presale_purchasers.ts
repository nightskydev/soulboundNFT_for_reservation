import { Connection, PublicKey, clusterApiUrl, ParsedTransactionWithMeta } from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";

// ============================================================
// CONFIGURATION - Modify these values before running
// ============================================================

// Program ID for the soulbound NFT contract
const PROGRAM_ID = new PublicKey("FY9yewUB1mQnURB7jZzog52LnUideQ35Apfc5WSVe1zD");

// Network to query (mainnet-beta, devnet, testnet)
const NETWORK: "mainnet-beta" | "devnet" | "testnet" = "devnet";

// Date range for presale period (Unix timestamps)
// Set to null for no date filtering
const PRESALE_START_DATE: number | null = null; // e.g., Math.floor(new Date('2024-01-01').getTime() / 1000)
const PRESALE_END_DATE: number | null = null;   // e.g., Math.floor(new Date('2024-12-31').getTime() / 1000)

// Output file paths
const OUTPUT_CSV = "presale_purchasers.csv";
const OUTPUT_JSON = "presale_purchasers.json";

// Batch size for fetching signatures (not transactions)
const BATCH_SIZE = 100;

// ============================================================
// SCRIPT
// ============================================================

interface PurchaserInfo {
  walletAddress: string;
  transactionSignature: string;
  mintAddress: string;
  mintDate: number;
  blockTime: number;
}

async function getAllConfirmedSignatures(
  connection: Connection,
  programId: PublicKey,
  before?: string,
  limit: number = 1000
): Promise<{ signature: string; slot: number; blockTime?: number }[]> {
  console.log(`Fetching signatures before: ${before || 'latest'}...`);

  const signatures = await connection.getSignaturesForAddress(
    programId,
    before ? { before, limit } : { limit }
  );

  console.log(`Found ${signatures.length} signatures in this batch`);

  // Filter out signatures that are too old if we have date constraints
  let filteredSignatures = signatures;
  if (PRESALE_END_DATE) {
    filteredSignatures = signatures.filter(sig => !sig.blockTime || sig.blockTime <= PRESALE_END_DATE);
  }
  if (PRESALE_START_DATE) {
    filteredSignatures = filteredSignatures.filter(sig => !sig.blockTime || sig.blockTime >= PRESALE_START_DATE);
  }

  console.log(`After date filtering: ${filteredSignatures.length} signatures`);

  return filteredSignatures.map(sig => ({
    signature: sig.signature,
    slot: sig.slot,
    blockTime: sig.blockTime
  }));
}

async function getAllSignaturesForProgram(
  connection: Connection,
  programId: PublicKey
): Promise<{ signature: string; slot: number; blockTime?: number }[]> {
  const allSignatures: { signature: string; slot: number; blockTime?: number }[] = [];
  let before: string | undefined;

  console.log("Fetching all confirmed signatures for program...");

  while (true) {
    const batch = await getAllConfirmedSignatures(connection, programId, before, BATCH_SIZE);

    if (batch.length === 0) {
      break;
    }

    allSignatures.push(...batch);

    // If we got less than the batch size, we've reached the end
    if (batch.length < BATCH_SIZE) {
      break;
    }

    // Set the before parameter to the last signature in this batch for pagination
    before = batch[batch.length - 1].signature;

    // Add a small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  console.log(`Total signatures found: ${allSignatures.length}`);
  return allSignatures;
}

async function getTransactionsFromBlocks(
  connection: Connection,
  signatures: { signature: string; slot: number; blockTime?: number }[]
): Promise<PurchaserInfo[]> {
  console.log(`Processing ${signatures.length} transactions...`);

  const purchasers: PurchaserInfo[] = [];
  const batchSize = 2; // Process 2 transactions at a time to avoid rate limiting

  for (let i = 0; i < signatures.length; i += batchSize) {
    const batch = signatures.slice(i, i + batchSize);
    console.log(`Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(signatures.length / batchSize)}`);

    const batchPromises = batch.map(async (sig) => {
      // Retry logic for rate limiting
      let retries = 0;
      const maxRetries = 3;

      while (retries < maxRetries) {
        try {
          const transaction = await connection.getParsedTransaction(sig.signature, {
            maxSupportedTransactionVersion: 0,
          });

        if (!transaction || !transaction.transaction || !transaction.transaction.message) {
          return null;
        }

        // Check if this transaction involves our program
        const accountKeys = transaction.transaction.message.accountKeys;
        const programIndex = accountKeys.findIndex(key => key.pubkey.toString() === PROGRAM_ID.toString());

        console.log(`Program index: ${programIndex}`);
        if (programIndex === -1) {
          return null; // Transaction doesn't involve our program
        }

        // Find our program's instruction in this transaction
        const instructions = transaction.transaction.message.instructions;

        for (const instruction of instructions) {
          if (instruction.programId.toString() === PROGRAM_ID.toString()) {
            // Get accounts - handle both ParsedInstruction and PartiallyDecodedInstruction
            let accounts: PublicKey[] = [];

            if ('accounts' in instruction) {
              // PartiallyDecodedInstruction - accounts are PublicKey objects
              accounts = instruction.accounts;
            } else {
              // ParsedInstruction - accounts are indices into message.accountKeys
              const accountIndices = (instruction as any).accounts || [];
              accounts = accountIndices.map((index: number) => new PublicKey(accountKeys[index].pubkey));
            }

            if (accounts.length >= 12 && accounts.length <= 15) { // mint_nft has ~13 accounts
              // Extract the signer and mint address
              const signer = accounts[0];
              let mintAddress = '';
              if (accounts.length > 3) {
                mintAddress = accounts[3].toString();
              }

              return {
                walletAddress: signer.toString(),
                transactionSignature: sig.signature,
                mintAddress,
                mintDate: sig.blockTime || transaction.blockTime || 0,
                blockTime: transaction.blockTime || 0,
              };
            }
          }
        }

        // If we get here, no mint_nft instruction was found
        return null;

        } catch (error: any) {
          if (error.message && error.message.includes('429')) {
            retries++;
            if (retries < maxRetries) {
              const delay = Math.pow(2, retries) * 1000; // Exponential backoff: 2s, 4s, 8s
              console.log(`Rate limited, retrying ${sig.signature} in ${delay}ms (attempt ${retries}/${maxRetries})`);
              await new Promise(resolve => setTimeout(resolve, delay));
              continue;
            }
          }
          console.error(`Error parsing transaction ${sig.signature}:`, error);
          return null;
        }
      }

      return null; // Max retries exceeded
    });

    const batchResults = await Promise.all(batchPromises);

    for (const result of batchResults) {
      if (result) {
        purchasers.push(result);
      }
    }

    // Add delay between batches to avoid rate limiting
    if (i + batchSize < signatures.length) {
      await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second delay
    }
  }

  return purchasers;
}

function deduplicatePurchasers(purchasers: PurchaserInfo[]): PurchaserInfo[] {
  const seen = new Set<string>();
  const deduplicated: PurchaserInfo[] = [];

  for (const purchaser of purchasers) {
    if (!seen.has(purchaser.walletAddress)) {
      seen.add(purchaser.walletAddress);
      deduplicated.push(purchaser);
    }
  }

  return deduplicated;
}

function exportToCSV(purchasers: PurchaserInfo[], filename: string) {
  const csvHeader = "Wallet Address,Transaction Signature,Mint Address,Mint Date (Unix),Block Time (Unix),Mint Date (ISO)\n";
  const csvRows = purchasers.map(p => {
    const isoDate = new Date(p.mintDate * 1000).toISOString();
    return `${p.walletAddress},${p.transactionSignature},${p.mintAddress},${p.mintDate},${p.blockTime},${isoDate}`;
  }).join('\n');

  const csvContent = csvHeader + csvRows;
  fs.writeFileSync(filename, csvContent);
  console.log(`Exported ${purchasers.length} purchasers to ${filename}`);
}

function exportToJSON(purchasers: PurchaserInfo[], filename: string) {
  const jsonContent = JSON.stringify({
    metadata: {
      totalPurchasers: purchasers.length,
      presaleStartDate: PRESALE_START_DATE,
      presaleEndDate: PRESALE_END_DATE,
      network: NETWORK,
      programId: PROGRAM_ID.toString(),
      generatedAt: new Date().toISOString(),
    },
    purchasers,
  }, null, 2);

  fs.writeFileSync(filename, jsonContent);
  console.log(`Exported ${purchasers.length} purchasers to ${filename}`);
}

async function main() {
  console.log("\n=== Querying Presale NFT Purchasers ===\n");

  // Connect to Solana network
  const connection = new Connection(clusterApiUrl(NETWORK), "confirmed");
  console.log(`Connected to ${NETWORK}`);

  // Get all signatures for the program
  const signatures = await getAllSignaturesForProgram(connection, PROGRAM_ID);

  if (signatures.length === 0) {
    console.log("No transactions found for this program.");
    return;
  }

  console.log(`\nProcessing ${signatures.length} transactions...`);

  // Process transactions in optimized batches
  const purchasers = await getTransactionsFromBlocks(connection, signatures);

  console.log(`\nFound ${purchasers.length} mint transactions`);

  // Remove duplicates (same wallet might have multiple transactions)
  const uniquePurchasers = deduplicatePurchasers(purchasers);
  console.log(`Unique purchasers: ${uniquePurchasers.length}`);

  // Sort by mint date
  uniquePurchasers.sort((a, b) => a.mintDate - b.mintDate);

  // Export results
  exportToCSV(uniquePurchasers, OUTPUT_CSV);
  exportToJSON(uniquePurchasers, OUTPUT_JSON);

  // Summary
  console.log("\n=== Summary ===");
  console.log(`Total transactions processed: ${signatures.length}`);
  console.log(`Mint transactions found: ${purchasers.length}`);
  console.log(`Unique purchasers: ${uniquePurchasers.length}`);

  if (PRESALE_START_DATE || PRESALE_END_DATE) {
    console.log(`\nDate filter applied:`);
    if (PRESALE_START_DATE) {
      console.log(`  Start: ${new Date(PRESALE_START_DATE * 1000).toISOString()}`);
    }
    if (PRESALE_END_DATE) {
      console.log(`  End: ${new Date(PRESALE_END_DATE * 1000).toISOString()}`);
    }
  }

  console.log(`\nOutput files:`);
  console.log(`  CSV: ${OUTPUT_CSV}`);
  console.log(`  JSON: ${OUTPUT_JSON}`);
}

main()
  .then(() => {
    console.log("\n✅ Script completed successfully!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Script failed:", error);
    process.exit(1);
  });
