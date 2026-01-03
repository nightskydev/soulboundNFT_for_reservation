import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { SoulboundNftForReservation } from "../target/types/soulbound_nft_for_reservation";
import { 
  PublicKey, 
  Connection, 
  clusterApiUrl, 
  Keypair, 
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  ComputeBudgetProgram,
} from "@solana/web3.js";
import { 
  TOKEN_PROGRAM_ID, 
  getAssociatedTokenAddressSync,
  getOrCreateAssociatedTokenAccount,
} from "@solana/spl-token";
import * as fs from "fs";
import * as os from "os";

// Configuration
const NFT_NAME = "TEST NFT";
const NFT_SYMBOL = "TEST";
const NFT_URI = "https://green-awkward-eagle-887.mypinata.cloud/ipfs/bafkreifipgio6h5rspvmw2mm2f7zbfmktaku7nvsx7wf7rl7zlcw2mvfvu"; // Replace with your metadata URI

const TOKEN_METADATA_PROGRAM_ID = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");
const SYSVAR_INSTRUCTIONS_PUBKEY = new PublicKey("Sysvar1nstructions1111111111111111111111111");

function getMetadataPda(mint: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("metadata"), TOKEN_METADATA_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    TOKEN_METADATA_PROGRAM_ID
  );
}

function getMasterEditionPda(mint: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("metadata"), TOKEN_METADATA_PROGRAM_ID.toBuffer(), mint.toBuffer(), Buffer.from("edition")],
    TOKEN_METADATA_PROGRAM_ID
  );
}

async function main() {
  console.log("\n=== Minting Soulbound NFT ===\n");

  // Parse command line arguments
  const collectionMintAddress = process.argv[2];
  if (!collectionMintAddress) {
    console.log("Usage: npx ts-node scripts/mint_nft.ts <COLLECTION_MINT_ADDRESS> [NFT_NAME] [NFT_SYMBOL] [NFT_URI]");
    console.log("  COLLECTION_MINT_ADDRESS: The OG collection mint address (required)");
    console.log("  NFT_NAME: Name for the NFT (optional, default: 'Soulbound OG NFT')");
    console.log("  NFT_SYMBOL: Symbol for the NFT (optional, default: 'SBNFT')");
    console.log("  NFT_URI: Metadata URI for the NFT (optional)");
    console.log("\nTo mint without collection, pass 'null' as the collection address.");
    process.exit(1);
  }

  const nftName = process.argv[3] || NFT_NAME;
  const nftSymbol = process.argv[4] || NFT_SYMBOL;
  const nftUri = process.argv[5] || NFT_URI;

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
  const programId = new PublicKey("7nwJWSLt65ZWBzBwSt9FTSF94phiafpj3NYzA7rm2Qb2");
  const program = new Program<SoulboundNftForReservation>(idl, provider);

  console.log("Program ID:", programId.toBase58());

  // Derive admin state PDA
  const [adminStatePda] = PublicKey.findProgramAddressSync(
    [Buffer.from("admin_state")],
    programId
  );
  console.log("Admin State PDA:", adminStatePda.toBase58());

  // Fetch admin state to get payment mint
  const adminState = await program.account.adminState.fetch(adminStatePda);
  const paymentMint = adminState.paymentMint;
  console.log("Payment Mint (USDC):", paymentMint.toBase58());
  console.log("Mint Fee:", adminState.mintFee.toString(), "lamports (", Number(adminState.mintFee) / 1_000_000, "USDC)");

  // Derive vault PDA
  const [vaultPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), paymentMint.toBuffer()],
    programId
  );
  console.log("Vault PDA:", vaultPda.toBase58());

  // Generate new mint keypair for the NFT
  const nftMint = Keypair.generate();
  console.log("\nNew NFT Mint:", nftMint.publicKey.toBase58());

  // Derive metadata PDA
  const [metadataAccount] = getMetadataPda(nftMint.publicKey);
  console.log("Metadata Account:", metadataAccount.toBase58());

  // Derive token account for the NFT
  const nftTokenAccount = getAssociatedTokenAddressSync(
    nftMint.publicKey,
    wallet.publicKey
  );
  console.log("NFT Token Account:", nftTokenAccount.toBase58());

  // Get or create payer's USDC token account
  console.log("\nChecking payer's USDC token account...");
  let payerTokenAccount;
  try {
    payerTokenAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      wallet.payer,
      paymentMint,
      wallet.publicKey
    );
    console.log("Payer Token Account:", payerTokenAccount.address.toBase58());
    console.log("Payer USDC Balance:", Number(payerTokenAccount.amount) / 1_000_000, "USDC");
    
    if (payerTokenAccount.amount < adminState.mintFee) {
      console.error(`\n❌ Insufficient USDC balance. Need ${Number(adminState.mintFee) / 1_000_000} USDC.`);
      console.log("Please fund your wallet with USDC on devnet.");
      process.exit(1);
    }
  } catch (error) {
    console.error("Failed to get/create payer token account:", error);
    process.exit(1);
  }

  // Handle collection mint
  let collectionMint: PublicKey | null = null;
  let collectionMetadata: PublicKey | null = null;
  let collectionMasterEdition: PublicKey | null = null;
  
  if (collectionMintAddress.toLowerCase() !== "null") {
    collectionMint = new PublicKey(collectionMintAddress);
    [collectionMetadata] = getMetadataPda(collectionMint);
    [collectionMasterEdition] = getMasterEditionPda(collectionMint);
    console.log("\nCollection Mint:", collectionMint.toBase58());
    console.log("Collection Metadata:", collectionMetadata.toBase58());
    console.log("Collection Master Edition:", collectionMasterEdition.toBase58());
  } else {
    console.log("\nMinting without collection.");
  }

  console.log("\n=== NFT Details ===");
  console.log("Name:", nftName);
  console.log("Symbol:", nftSymbol);
  console.log("URI:", nftUri);

  // Add compute budget instructions
  const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({
    units: 400_000,
  });
  const addPriorityFee = ComputeBudgetProgram.setComputeUnitPrice({
    microLamports: 50_000,
  });

  try {
    console.log("\n⏳ Minting NFT...");
    
    const tx = await program.methods
      .mintNft(nftName, nftSymbol, nftUri)
      .accounts({
        signer: wallet.publicKey,
        tokenAccount: nftTokenAccount,
        mint: nftMint.publicKey,
        metadataAccount: metadataAccount,
        paymentMint: paymentMint,
        payerTokenAccount: payerTokenAccount.address,
        paymentTokenProgram: TOKEN_PROGRAM_ID,
        collectionMint: collectionMint,
        collectionMetadata: collectionMetadata,
        collectionMasterEdition: collectionMasterEdition,
      })
      .preInstructions([modifyComputeUnits, addPriorityFee])
      .signers([wallet.payer, nftMint])
      .rpc({ skipPreflight: true });

    console.log("\n✅ NFT Minted Successfully!");
    console.log("Transaction signature:", tx);
    console.log(`View on Solana Explorer: https://explorer.solana.com/tx/${tx}?cluster=devnet`);
    console.log(`View NFT on Solana Explorer: https://explorer.solana.com/address/${nftMint.publicKey.toBase58()}?cluster=devnet`);

    // Save mint keypair for future reference
    const keysDir = "./keys";
    if (!fs.existsSync(keysDir)) {
      fs.mkdirSync(keysDir, { recursive: true });
    }
    const mintKeyPath = `${keysDir}/nft_${nftMint.publicKey.toBase58().slice(0, 8)}.json`;
    fs.writeFileSync(mintKeyPath, JSON.stringify(Array.from(nftMint.secretKey)));
    console.log(`\nNFT mint keypair saved to: ${mintKeyPath}`);

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

