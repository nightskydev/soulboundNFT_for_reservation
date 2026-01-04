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
} from "@solana/spl-token";
import * as fs from "fs";
import * as os from "os";

// Configuration
const NFT_NAME = "ADMIN AIRDROP NFT";
const NFT_SYMBOL = "ADMIN";
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
  console.log("\n=== Admin Minting Soulbound NFT (Airdrop) ===\n");

  // Parse command line arguments
  const collectionTypeArg = process.argv[2];
  const collectionMintAddress = process.argv[3];
  const recipientAddress = process.argv[4];
  if (!collectionTypeArg || !collectionMintAddress || !recipientAddress) {
    console.log("Usage: npx ts-node scripts/admin_mint_nft.ts <COLLECTION_TYPE> <COLLECTION_MINT_ADDRESS> <RECIPIENT_ADDRESS> [NFT_NAME] [NFT_SYMBOL] [NFT_URI]");
    console.log("  COLLECTION_TYPE: 'og', 'regular', or 'basic' (required)");
    console.log("  COLLECTION_MINT_ADDRESS: The collection mint address (required)");
    console.log("  RECIPIENT_ADDRESS: The recipient wallet address for the airdrop (required)");
    console.log("  NFT_NAME: Name for the NFT (optional, default: 'ADMIN AIRDROP NFT')");
    console.log("  NFT_SYMBOL: Symbol for the NFT (optional, default: 'ADMIN')");
    console.log("  NFT_URI: Metadata URI for the NFT (optional)");
    console.log("\nExamples:");
    console.log("  npx ts-node scripts/admin_mint_nft.ts og <OG_COLLECTION_MINT> <RECIPIENT_ADDRESS>");
    console.log("  npx ts-node scripts/admin_mint_nft.ts regular <REGULAR_COLLECTION_MINT> <RECIPIENT_ADDRESS> 'Airdrop NFT' 'AIRDROP'");
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

  const nftName = process.argv[5] || NFT_NAME;
  const nftSymbol = process.argv[6] || NFT_SYMBOL;
  const nftUri = process.argv[7] || NFT_URI;

  // Load wallet from default Solana config path
  const walletPath = `${os.homedir()}/.config/solana/id.json`;
  if (!fs.existsSync(walletPath)) {
    throw new Error(`Wallet not found at ${walletPath}. Please create one with 'solana-keygen new'`);
  }
  const walletKeypair = Keypair.fromSecretKey(
    Buffer.from(JSON.parse(fs.readFileSync(walletPath, "utf-8")))
  );
  const wallet = new anchor.Wallet(walletKeypair);

  console.log("Admin Wallet:", wallet.publicKey.toBase58());

  // Parse recipient address
  let recipient: PublicKey;
  try {
    recipient = new PublicKey(recipientAddress);
    console.log("Recipient:", recipient.toBase58());
  } catch (error) {
    console.error(`\n❌ Invalid recipient address: ${recipientAddress}`);
    process.exit(1);
  }

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
  const programId = new PublicKey("AzcZ8LcBKu1tT8ahYYqVTbUpfaonJmkGFNnPajYKSW9L");
  const program = new Program<SoulboundNftForReservation>(idl, provider);

  console.log("Program ID:", programId.toBase58());

  // Derive admin state PDA
  const [adminStatePda] = PublicKey.findProgramAddressSync(
    [Buffer.from("admin_state")],
    programId
  );
  console.log("Admin State PDA:", adminStatePda.toBase58());

  // Fetch admin state to verify admin and get collection config
  const adminState = await program.account.adminState.fetch(adminStatePda);

  // Verify that the signer is the super admin
  if (wallet.publicKey.toBase58() !== adminState.superAdmin.toBase58()) {
    console.error(`\n❌ Unauthorized! You are not the super admin.`);
    console.error(`Super admin: ${adminState.superAdmin.toBase58()}`);
    console.error(`Your wallet: ${wallet.publicKey.toBase58()}`);
    process.exit(1);
  }
  console.log("✅ Authorized as super admin");

  // Get the collection config based on collection type
  let collectionConfig;
  let collectionName;
  if (collectionType.og) {
    collectionConfig = adminState.ogCollection;
    collectionName = "OG";
  } else if (collectionType.regular) {
    collectionConfig = adminState.regularCollection;
    collectionName = "Regular";
  } else {
    collectionConfig = adminState.basicCollection;
    collectionName = "Basic";
  }

  console.log(`\n=== ${collectionName} Collection ===`);
  console.log("Collection Mint:", collectionConfig.collectionMint.toBase58());
  console.log("Mint Fee:", collectionConfig.mintFee.toString(), "lamports (", Number(collectionConfig.mintFee) / 1_000_000, "USDC)");
  console.log("Max Supply:", collectionConfig.maxSupply.toString());
  console.log("Current Count:", collectionConfig.currentReservedCount.toString());

  // Derive vault PDA (not used for admin mint, but showing for reference)
  const [vaultPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), adminState.paymentMint.toBuffer()],
    programId
  );
  console.log("Vault PDA:", vaultPda.toBase58());

  // Generate new mint keypair for the NFT
  const nftMint = Keypair.generate();
  console.log("\nNew NFT Mint:", nftMint.publicKey.toBase58());

  // Derive metadata PDA
  const [metadataAccount] = getMetadataPda(nftMint.publicKey);
  console.log("Metadata Account:", metadataAccount.toBase58());

  // Derive token account for the NFT (recipient's ATA)
  const nftTokenAccount = getAssociatedTokenAddressSync(
    nftMint.publicKey,
    recipient
  );
  console.log("NFT Token Account (Recipient ATA):", nftTokenAccount.toBase58());

  // Verify collection mint matches
  const collectionMint = new PublicKey(collectionMintAddress);
  if (collectionMint.toBase58() !== collectionConfig.collectionMint.toBase58()) {
    console.error(`\n❌ Collection mint mismatch!`);
    console.error(`Expected: ${collectionConfig.collectionMint.toBase58()}`);
    console.error(`Provided: ${collectionMint.toBase58()}`);
    process.exit(1);
  }

  const [collectionMetadata] = getMetadataPda(collectionMint);
  const [collectionMasterEdition] = getMasterEditionPda(collectionMint);
  console.log("\nCollection Mint:", collectionMint.toBase58());
  console.log("Collection Metadata:", collectionMetadata.toBase58());
  console.log("Collection Master Edition:", collectionMasterEdition.toBase58());

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
    console.log("\n⏳ Admin minting NFT (airdrop)...");

    const tx = await program.methods
      .adminMintNft(collectionType, nftName, nftSymbol, nftUri)
      .accounts({
        admin: wallet.publicKey,
        recipient: recipient,
        recipientTokenAccount: nftTokenAccount,
        mint: nftMint.publicKey,
        metadataAccount: metadataAccount,
        collectionMint: collectionMint,
        collectionMetadata: collectionMetadata,
        collectionMasterEdition: collectionMasterEdition,
      })
      .preInstructions([modifyComputeUnits, addPriorityFee])
      .signers([wallet.payer, nftMint])
      .rpc({ skipPreflight: true });

    console.log("\n✅ NFT Airdropped Successfully!");
    console.log("Transaction signature:", tx);
    console.log(`View on Solana Explorer: https://explorer.solana.com/tx/${tx}?cluster=devnet`);
    console.log(`View NFT on Solana Explorer: https://explorer.solana.com/address/${nftMint.publicKey.toBase58()}?cluster=devnet`);

    // Save mint keypair for future reference
    const keysDir = "./keys";
    if (!fs.existsSync(keysDir)) {
      fs.mkdirSync(keysDir, { recursive: true });
    }
    const mintKeyPath = `${keysDir}/admin_airdrop_${nftMint.publicKey.toBase58().slice(0, 8)}.json`;
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
