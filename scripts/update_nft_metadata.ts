import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { SoulboundNftForReservation } from "../target/types/soulbound_nft_for_reservation";
import { 
  PublicKey, 
  Connection, 
  clusterApiUrl, 
  Keypair,
} from "@solana/web3.js";
import * as fs from "fs";
import * as os from "os";

const TOKEN_METADATA_PROGRAM_ID = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");
const SYSVAR_INSTRUCTIONS_PUBKEY = new PublicKey("Sysvar1nstructions1111111111111111111111111");

function getMetadataPda(mint: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("metadata"), TOKEN_METADATA_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    TOKEN_METADATA_PROGRAM_ID
  );
}

async function main() {
  console.log("\n=== Updating NFT Metadata ===\n");

  // Parse command line arguments
  const nftMintAddress = process.argv[2];
  const newName = process.argv[3];
  const newSymbol = process.argv[4];
  const newUri = process.argv[5];

  if (!nftMintAddress || !newName || !newSymbol || !newUri) {
    console.log("Usage: npx ts-node scripts/update_nft_metadata.ts <NFT_MINT_ADDRESS> <NEW_NAME> <NEW_SYMBOL> <NEW_URI>");
    console.log("\nExample:");
    console.log('  npx ts-node scripts/update_nft_metadata.ts ABC123... "Updated NFT Name" "UNFT" "https://new-uri.com/metadata.json"');
    process.exit(1);
  }

  // Load wallet from default Solana config path
  const walletPath = `${os.homedir()}/.config/solana/id.json`;
  if (!fs.existsSync(walletPath)) {
    throw new Error(`Wallet not found at ${walletPath}. Please create one with 'solana-keygen new'`);
  }
  const walletKeypair = Keypair.fromSecretKey(
    Buffer.from(JSON.parse(fs.readFileSync(walletPath, "utf-8")))
  );
  const wallet = new anchor.Wallet(walletKeypair);

  console.log("Super Admin Wallet:", wallet.publicKey.toBase58());

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

  // Get NFT mint
  const nftMint = new PublicKey(nftMintAddress);
  console.log("\nNFT Mint:", nftMint.toBase58());

  // Derive metadata PDA
  const [metadataAccount] = getMetadataPda(nftMint);
  console.log("Metadata Account:", metadataAccount.toBase58());

  console.log("\n=== New Metadata ===");
  console.log("Name:", newName);
  console.log("Symbol:", newSymbol);
  console.log("URI:", newUri);

  try {
    console.log("\n⏳ Updating NFT metadata...");
    
    const tx = await program.methods
      .updateNftMetadata(newName, newSymbol, newUri)
      .accounts({
        superAdmin: wallet.publicKey,
        mint: nftMint,
        metadataAccount: metadataAccount,
        adminState: adminStatePda,
        tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
      })
      .rpc();

    console.log("\n✅ NFT Metadata Updated Successfully!");
    console.log("Transaction signature:", tx);
    console.log(`View on Solana Explorer: https://explorer.solana.com/tx/${tx}?cluster=devnet`);
    console.log(`View NFT on Solana Explorer: https://explorer.solana.com/address/${nftMint.toBase58()}?cluster=devnet`);

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

