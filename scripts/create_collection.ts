import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { SoulboundNftForReservation } from "../target/types/soulbound_nft_for_reservation";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { 
  Connection, 
  Keypair, 
  PublicKey, 
  clusterApiUrl,
  ComputeBudgetProgram,
} from "@solana/web3.js";
import * as fs from "fs";
import * as os from "os";

// ============================================================
// CONFIGURATION - Modify these values before running
// ============================================================

// Metaplex Token Metadata Program ID
const TOKEN_METADATA_PROGRAM_ID = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");

// Collection metadata - MODIFY THESE FOR YOUR COLLECTION
const COLLECTION_NAME = "AuthEnTHICator OG Collection";
const COLLECTION_SYMBOL = "AUTH";
const COLLECTION_URI = "https://green-awkward-eagle-887.mypinata.cloud/ipfs/bafkreifipgio6h5rspvmw2mm2f7zbfmktaku7nvsx7wf7rl7zlcw2mvfvu"; // Replace with your metadata URI

// Collection type: "og"
// Note: dongle_proof collection type has been removed
const COLLECTION_TYPE: "og" = "og";

// ============================================================
// SCRIPT
// ============================================================

async function main() {
  console.log("\n=== Creating Collection NFT on Devnet ===\n");

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
  
  // Check wallet balance
  const balance = await connection.getBalance(wallet.publicKey);
  console.log("Wallet balance:", balance / 1e9, "SOL");
  
  if (balance < 0.1 * 1e9) {
    console.error("\n⚠️  Warning: Low SOL balance. Creating collection requires ~0.05 SOL.");
    console.log("Run: solana airdrop 2 --url devnet");
  }

  // Set up Anchor provider
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
  const programId = new PublicKey("AzcZ8LcBKu1tT8ahYYqVTbUpfaonJmkGFNnPajYKSW9L");
  const program = new Program<SoulboundNftForReservation>(idl, provider);

  console.log("Program ID:", programId.toBase58());
  console.log("Token Metadata Program:", TOKEN_METADATA_PROGRAM_ID.toBase58());

  // Derive admin state PDA
  const [adminState] = PublicKey.findProgramAddressSync(
    [Buffer.from("admin_state")],
    programId
  );
  console.log("Admin State PDA:", adminState.toBase58());

  // Check if admin state exists
  try {
    await program.account.adminState.fetch(adminState);
    console.log("✅ Admin state exists");
  } catch (e) {
    throw new Error("❌ Admin state not initialized. Please run init_admin.ts first.");
  }

  // Generate a new keypair for the collection mint
  const collectionMint = Keypair.generate();
  console.log("\nNew Collection Mint:", collectionMint.publicKey.toBase58());

  // Derive metadata account PDA
  const [metadataAccount] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("metadata"),
      TOKEN_METADATA_PROGRAM_ID.toBuffer(),
      collectionMint.publicKey.toBuffer(),
    ],
    TOKEN_METADATA_PROGRAM_ID
  );
  console.log("Metadata Account PDA:", metadataAccount.toBase58());

  // Derive master edition account PDA
  const [masterEditionAccount] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("metadata"),
      TOKEN_METADATA_PROGRAM_ID.toBuffer(),
      collectionMint.publicKey.toBuffer(),
      Buffer.from("edition"),
    ],
    TOKEN_METADATA_PROGRAM_ID
  );
  console.log("Master Edition PDA:", masterEditionAccount.toBase58());

  // Derive collection state PDA
  const [collectionState] = PublicKey.findProgramAddressSync(
    [Buffer.from("collection"), collectionMint.publicKey.toBuffer()],
    programId
  );
  console.log("Collection State PDA:", collectionState.toBase58());

  // Derive collection token account (ATA for admin_state to hold the 1 collection NFT)
  const collectionTokenAccount = getAssociatedTokenAddressSync(
    collectionMint.publicKey,
    adminState,
    true // allowOwnerOffCurve - required for PDA owners
  );
  console.log("Collection Token Account:", collectionTokenAccount.toBase58());

  // Display collection info
  console.log("\nCollection Details:");
  console.log("  - Name:", COLLECTION_NAME);
  console.log("  - Symbol:", COLLECTION_SYMBOL);
  console.log("  - URI:", COLLECTION_URI);
  console.log("  - Type:", COLLECTION_TYPE);
  console.log("");

  try {
    // Add compute budget instructions for Metaplex operations
    const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({
      units: 400_000, // Increase compute units for Metaplex operations
    });
    
    const tx = await program.methods
      .createCollectionNft(COLLECTION_NAME, COLLECTION_SYMBOL, COLLECTION_URI)
      .accounts({
        signer: wallet.publicKey,
        collectionMint: collectionMint.publicKey,
        collectionTokenAccount: collectionTokenAccount,
        metadataAccount: metadataAccount,
        masterEditionAccount: masterEditionAccount,
      })
      .preInstructions([modifyComputeUnits])
      .signers([collectionMint])
      .rpc({ skipPreflight: true });
    console.log("tx:", tx);

    console.log("✅ Transaction successful!");
    console.log("Transaction signature:", tx);
    console.log(`View on Solana Explorer: https://explorer.solana.com/tx/${tx}?cluster=devnet`);

    // Wait for confirmation
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Verify the collection state
    const state = await program.account.collectionState.fetch(collectionState);
    console.log("\n=== Verified Collection State ===");
    console.log("Collection Mint:", state.collectionMint.toBase58());
    console.log("Name:", state.name);
    console.log("Symbol:", state.symbol);
    console.log("URI:", state.uri);
    console.log("Created At:", new Date(state.createdAt.toNumber() * 1000).toISOString());
    console.log("Is Verified:", state.isVerified);

    // Show next steps
    console.log("\n=== Next Steps ===");
    console.log(`\nTo set this as the ${COLLECTION_TYPE} collection, run:`);
    console.log(`\n  npx ts-node scripts/update_og_collection.ts ${collectionMint.publicKey.toBase58()}`);
    console.log("\nOr call update_og_collection instruction with:");
    console.log(`  og_collection: ${collectionMint.publicKey.toBase58()}`);

    // Save collection mint keypair for reference
    const keypairPath = `./keys/collection_${COLLECTION_TYPE}_${collectionMint.publicKey.toBase58().slice(0, 8)}.json`;
    const keysDir = "./keys";
    if (!fs.existsSync(keysDir)) {
      fs.mkdirSync(keysDir, { recursive: true });
    }
    fs.writeFileSync(
      keypairPath,
      JSON.stringify(Array.from(collectionMint.secretKey))
    );
    console.log(`\n📁 Collection mint keypair saved to: ${keypairPath}`);

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

