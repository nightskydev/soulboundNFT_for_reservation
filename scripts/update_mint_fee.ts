import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { SoulboundNftForReservation } from "../target/types/soulbound_nft_for_reservation";
import { PublicKey, Connection, clusterApiUrl, Keypair } from "@solana/web3.js";
import * as fs from "fs";
import * as os from "os";

// Configuration - 0.01 USDC (USDC has 6 decimals)
const MINT_FEE_USDC = 0.01;
const USDC_DECIMALS = 6;
const MINT_FEE = MINT_FEE_USDC * Math.pow(10, USDC_DECIMALS); // 10000 lamports

async function main() {
  console.log("\n=== Updating Mint Fee for a Collection ===\n");

  // Parse command line arguments
  const collectionTypeArg = process.argv[2];
  const customFeeUsdc = process.argv[3] ? parseFloat(process.argv[3]) : MINT_FEE_USDC;
  
  if (!collectionTypeArg) {
    console.log("Usage: npx ts-node scripts/update_mint_fee.ts <COLLECTION_TYPE> [FEE_IN_USDC]");
    console.log("  COLLECTION_TYPE: 'og', 'regular', or 'basic' (required)");
    console.log("  FEE_IN_USDC: Fee amount in USDC (optional, default: 0.01)");
    console.log("\nExamples:");
    console.log("  npx ts-node scripts/update_mint_fee.ts og 5.0");
    console.log("  npx ts-node scripts/update_mint_fee.ts regular 3.0");
    console.log("  npx ts-node scripts/update_mint_fee.ts basic 1.0");
    process.exit(1);
  }

  // Parse collection type
  const collectionTypeMap: { [key: string]: any } = {
    'og': { og: {} },
    'regular': { regular: {} },
    'basic': { basic: {} }
  };
  
  const collectionType = collectionTypeMap[collectionTypeArg.toLowerCase()];
  if (!collectionType) {
    console.error(`\n❌ Invalid collection type: ${collectionTypeArg}`);
    console.log("Valid types: og, regular, basic");
    process.exit(1);
  }

  const mintFee = Math.floor(customFeeUsdc * Math.pow(10, USDC_DECIMALS));
  console.log(`Collection Type: ${collectionTypeArg.toUpperCase()}`);
  console.log(`Setting mint fee to: ${customFeeUsdc} USDC (${mintFee} base units)`);

  // Load wallet from default Solana config path
  const walletPath = `${os.homedir()}/.config/solana/id.json`;
  if (!fs.existsSync(walletPath)) {
    throw new Error(`Wallet not found at ${walletPath}. Please create one with 'solana-keygen new'`);
  }
  const walletKeypair = Keypair.fromSecretKey(
    Buffer.from(JSON.parse(fs.readFileSync(walletPath, "utf-8")))
  );
  const wallet = new anchor.Wallet(walletKeypair);

  console.log("Wallet:", wallet.publicKey.toBase58());

  // Connect to devnet
  const connection = new Connection(clusterApiUrl("devnet"), "confirmed");
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
    preflightCommitment: "confirmed",
  });
  anchor.setProvider(provider);

  // Load the program
  const idlPath = "./target/idl/soulbound_nft_for_reservation.json";
  if (!fs.existsSync(idlPath)) {
    throw new Error(`IDL not found at ${idlPath}. Please run 'anchor build' first.`);
  }
  const idl = JSON.parse(fs.readFileSync(idlPath, "utf-8"));
  const programId = new PublicKey("Ca8PS65mtseoGEsJpVbAbrXuTUamU9moSGSonVTtpnHt");
  const program = new Program<SoulboundNftForReservation>(idl, provider);

  console.log("Program ID:", programId.toBase58());

  // Derive admin state PDA
  const [adminStatePda] = PublicKey.findProgramAddressSync(
    [Buffer.from("admin_state")],
    programId
  );
  console.log("Admin State PDA:", adminStatePda.toBase58());

  // Fetch current admin state
  const adminStateBefore = await program.account.adminState.fetch(adminStatePda);
  
  // Get the collection config
  let collectionConfig;
  let collectionName;
  if (collectionType.og) {
    collectionConfig = adminStateBefore.ogCollection;
    collectionName = "OG";
  } else if (collectionType.regular) {
    collectionConfig = adminStateBefore.regularCollection;
    collectionName = "Regular";
  } else {
    collectionConfig = adminStateBefore.basicCollection;
    collectionName = "Basic";
  }
  
  console.log("\n=== Current State ===");
  console.log(`Current ${collectionName} Collection mint fee:`, Number(collectionConfig.mintFee) / Math.pow(10, USDC_DECIMALS), "USDC");
  console.log("Super Admin:", adminStateBefore.superAdmin.toBase58());

  // Verify caller is super admin
  if (!adminStateBefore.superAdmin.equals(wallet.publicKey)) {
    console.error("\n❌ Error: Only the super admin can update the mint fee.");
    console.error("Super Admin:", adminStateBefore.superAdmin.toBase58());
    console.error("Your Wallet:", wallet.publicKey.toBase58());
    process.exit(1);
  }

  try {
    console.log("\n⏳ Updating mint fee...");
    
    const tx = await program.methods
      .updateMintFee(collectionType, new anchor.BN(mintFee))
      .accounts({
        superAdmin: wallet.publicKey,
      })
      .signers([wallet.payer])
      .rpc();

    console.log("\n✅ Mint fee updated successfully!");
    console.log("Transaction signature:", tx);
    console.log(`View on Solana Explorer: https://explorer.solana.com/tx/${tx}?cluster=devnet`);

    // Verify the update
    await new Promise(resolve => setTimeout(resolve, 2000));
    const adminStateAfter = await program.account.adminState.fetch(adminStatePda);
    
    // Get updated collection config
    let updatedCollectionConfig;
    if (collectionType.og) {
      updatedCollectionConfig = adminStateAfter.ogCollection;
    } else if (collectionType.regular) {
      updatedCollectionConfig = adminStateAfter.regularCollection;
    } else {
      updatedCollectionConfig = adminStateAfter.basicCollection;
    }
    
    console.log("\n=== Updated State ===");
    console.log(`New ${collectionName} Collection mint fee:`, Number(updatedCollectionConfig.mintFee) / Math.pow(10, USDC_DECIMALS), "USDC");

  } catch (error: any) {
    console.error("\n❌ Transaction failed!");
    console.error("Error:", error);
    if (error.logs) {
      console.error("\nProgram logs:");
      error.logs.forEach((log: string) => console.error("  ", log));
    }
    throw error;
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

