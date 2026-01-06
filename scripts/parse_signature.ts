import { Connection, PublicKey, clusterApiUrl, ParsedTransactionWithMeta } from "@solana/web3.js";

// ============================================================
// CONFIGURATION
// ============================================================

// Program ID for the soulbound NFT contract
const PROGRAM_ID = new PublicKey("Ca8PS65mtseoGEsJpVbAbrXuTUamU9moSGSonVTtpnHt");

// Network to query (mainnet-beta, devnet, testnet)
const NETWORK: "mainnet-beta" | "devnet" | "testnet" = "devnet";

// ============================================================
// SCRIPT
// ============================================================

interface MintNftData {
  walletAddress: string;
  transactionSignature: string;
  mintAddress: string;
  timestamp: number;
  blockTime: number;
}

function createMintNftResult(eventData: any, signature: string, blockTime: number): MintNftData {
  const result: MintNftData = {
    walletAddress: eventData.user,
    transactionSignature: signature,
    mintAddress: eventData.mint_address,
    timestamp: eventData.timestamp,
    blockTime: blockTime,
  };

  console.log("✅ Found MintNftEvent:");
  console.log(`   User: ${result.walletAddress}`);
  console.log(`   Mint Address: ${result.mintAddress}`);
  console.log(`   Timestamp: ${new Date(result.timestamp * 1000).toISOString()}`);
  console.log(`   Block Time: ${new Date(result.blockTime * 1000).toISOString()}`);

  return result;
}

async function parseSignature(signature: string): Promise<MintNftData | null> {
  console.log(`Parsing signature: ${signature}`);

  // Connect to Solana network
  const connection = new Connection(clusterApiUrl(NETWORK), "confirmed");

  try {
    // Fetch the transaction
    const transaction = await connection.getParsedTransaction(signature, {
      maxSupportedTransactionVersion: 0,
    });
  // console.log(`Transaction: ${JSON.stringify(transaction)}`);


    if (!transaction || !transaction.transaction || !transaction.transaction.message) {
      console.log("❌ Transaction not found or invalid");
      return null;
    }

    // Check if this transaction involves our program
    const accountKeys = transaction.transaction.message.accountKeys;
    const programIndex = accountKeys.findIndex(key => key.pubkey.toString() === PROGRAM_ID.toString());

    if (programIndex === -1) {
      console.log("❌ Transaction doesn't involve our program");
      return null;
    }

    // Check for MintNftEvent in transaction logs and program data
    if (transaction.meta) {
      const logMessages = transaction.meta.logMessages || [];

      // Method 1: Look for MintNftEvent in log messages (JSON format)
      const mintNftLog = logMessages.find(log =>
        log.includes('MintNftEvent') && log.includes('Event:')
      );
      if (mintNftLog) {
        try {
          const eventDataMatch = mintNftLog.match(/Event:\s*(\{.*\})/);
          if (eventDataMatch) {
            const eventData = JSON.parse(eventDataMatch[1]);
            return createMintNftResult(eventData, signature, transaction.blockTime || 0);
          }
        } catch (parseError) {
          console.error(`❌ Failed to parse MintNftEvent from log: ${mintNftLog}`);
        }
      }

      // Method 2: Look for event in program return data (binary format)
      // Anchor events can be emitted as "Program data:" in base64
      const programDataLog = logMessages.find(log =>
        log.startsWith('Program data: ')
      );

      if (programDataLog) {
        try {
          // Extract base64 data after "Program data: "
          const base64Data = programDataLog.replace('Program data: ', '');
          const eventBuffer = Buffer.from(base64Data, 'base64');
          
          // Check if this matches our event discriminator (first 8 bytes)
          const expectedDiscriminator = Buffer.from([176, 112, 170, 107, 46, 35, 212, 160]); // From IDL
          console.log({eventBuffer, expectedDiscriminator})

          if (eventBuffer.length >= 8 && eventBuffer.subarray(0, 8).equals(expectedDiscriminator)) {
            // Parse the event data (32 bytes user + 32 bytes mint_address + 8 bytes timestamp = 72 bytes total)
            const user = new PublicKey(eventBuffer.subarray(8, 40));
            const mintAddress = new PublicKey(eventBuffer.subarray(40, 72));
            const timestamp = eventBuffer.readBigInt64LE(72);

            const eventData = {
              user: user.toString(),
              mint_address: mintAddress.toString(),
              timestamp: Number(timestamp)
            };

            console.log("✅ Found MintNftEvent in program data (binary format)");
            return createMintNftResult(eventData, signature, transaction.blockTime || 0);
          }
        } catch (parseError) {
          console.error(`❌ Failed to parse MintNftEvent from program data: ${programDataLog}`);
        }
      }
    }

    console.log("❌ No MintNftEvent found in this transaction");
    return null;

  } catch (error: any) {
    console.error(`❌ Error parsing signature ${signature}:`, error.message);
    return null;
  }
}

async function main() {
  console.log("\n=== Parse Single Signature ===\n");

  const signature = "2p4aei8FkTiQV7hJD2rhVLwbaV73e2HBeYjNXmibaem9Z3ADvm6kohf2zryTNh8pQT3fDeiBrkeY2x1bA6w1DzRw";

  if (!signature) {
    console.log("❌ Please provide a transaction signature as a command line argument");
    console.log("Usage: npx ts-node scripts/parse_signature.ts <signature>");
    console.log("Example: npx ts-node scripts/parse_signature.ts 5xK...xyz");
    process.exit(1);
  }

  // Validate signature format (basic check)
  if (!signature.match(/^[A-Za-z0-9]{87,88}$/)) {
    console.log("❌ Invalid signature format. Solana signatures are 87-88 characters long.");
    process.exit(1);
  }

  const result = await parseSignature(signature);

  if (result) {
    console.log("\n=== Result ===");
    console.log(JSON.stringify(result, null, 2));
    console.log("\n✅ Successfully parsed MintNftEvent from transaction");
  } else {
    console.log("\n❌ No MintNftEvent found in the provided signature");
    process.exit(1);
  }
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
