import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { SoulboundNftForReservation } from "../target/types/soulbound_nft_for_reservation";
import { Connection, Keypair, PublicKey, clusterApiUrl } from "@solana/web3.js";
import * as fs from "fs";
import * as os from "os";

// ============================================================
// USAGE: npx ts-node scripts/update_dongle_proof_collection.ts <COLLECTION_MINT_ADDRESS>
// ============================================================

async function main() {
  // Get collection address from command line args
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error("❌ Usage: npx ts-node scripts/update_dongle_proof_collection.ts <COLLECTION_MINT_ADDRESS>");
    process.exit(1);
  }

  const dongleProofCollectionAddress = new PublicKey(args[0]);
  console.log("\n=== Updating Dongle Proof Collection on Devnet ===\n");
  console.log("Dongle Proof Collection Address:", dongleProofCollectionAddress.toBase58());

  // Load wallet from default Solana config path
  const walletPath = `${os.homedir()}/.config/solana/id.json`;
  if (!fs.existsSync(walletPath)) {
    throw new Error(`Wallet not found at ${walletPath}. Please create one with 'solana-keygen new'`);
  }
  
  const walletKeypair = Keypair.fromSecretKey(
    Buffer.from(JSON.parse(fs.readFileSync(walletPath, "utf-8")))
  );
  const wallet = new anchor.Wallet(walletKeypair);
  
  console.log("Wallet (Super Admin):", wallet.publicKey.toBase58());

  // Connect to devnet
  const connection = new Connection(clusterApiUrl("devnet"), "confirmed");

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
  const programId = new PublicKey("7nwJWSLt65ZWBzBwSt9FTSF94phiafpj3NYzA7rm2Qb2");
  const program = new Program<SoulboundNftForReservation>(idl, provider);

  // Derive admin state PDA
  const [adminState] = PublicKey.findProgramAddressSync(
    [Buffer.from("admin_state")],
    programId
  );

  // Check current state
  const currentState = await program.account.adminState.fetch(adminState);
  console.log("\nCurrent Dongle Proof Collection:", currentState.dongleProofCollection.toBase58());

  try {
    const tx = await program.methods
      .updateDongleProofCollection(dongleProofCollectionAddress)
      .accounts({
        superAdmin: wallet.publicKey,
      })
      .rpc();

    console.log("\n✅ Transaction successful!");
    console.log("Transaction signature:", tx);
    console.log(`View on Solana Explorer: https://explorer.solana.com/tx/${tx}?cluster=devnet`);

    // Verify update
    await new Promise(resolve => setTimeout(resolve, 2000));
    const updatedState = await program.account.adminState.fetch(adminState);
    console.log("\nUpdated Dongle Proof Collection:", updatedState.dongleProofCollection.toBase58());

  } catch (error: any) {
    console.error("\n❌ Transaction failed!");
    console.error("Error:", error.message);
    
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

