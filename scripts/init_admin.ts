import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { SoulboundNftForReservation } from "../target/types/soulbound_nft_for_reservation";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { Connection, Keypair, PublicKey, clusterApiUrl } from "@solana/web3.js";
import * as fs from "fs";
import * as os from "os";

// ============================================================
// CONFIGURATION - Modify these values before running
// ============================================================

// Devnet USDC mint address (Circle's official devnet USDC)
const PAYMENT_MINT = new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");

// Withdraw wallet - where funds will be sent (SET YOUR OWN ADDRESS)
const WITHDRAW_WALLET = new PublicKey("BUj6XyFHkoPnfFkGiD32euAiFEjS8kLdBuqHqSST15VM");

// Program parameters
const PAYMENT_DECIMALS = 6; // USDC has 6 decimals

// OG Collection parameters
const OG_COLLECTION_MINT = Keypair.generate().publicKey;
const OG_MINT_FEE = 5_000_000; // 5 USDC (5 * 10^6)
const OG_MAX_SUPPLY = 100; // Maximum 100 OG NFTs

// Regular Collection parameters
const REGULAR_COLLECTION_MINT = Keypair.generate().publicKey;
const REGULAR_MINT_FEE = 3_000_000; // 3 USDC (3 * 10^6)
const REGULAR_MAX_SUPPLY = 500; // Maximum 500 Regular NFTs

// Basic Collection parameters
const BASIC_COLLECTION_MINT = Keypair.generate().publicKey;
const BASIC_MINT_FEE = 1_000_000; // 1 USDC (1 * 10^6)
const BASIC_MAX_SUPPLY = 1000; // Maximum 1000 Basic NFTs

// Shared parameters
const MINT_START_DATE = 0; // 0 = no time restriction, or set Unix timestamp

// ============================================================
// SCRIPT
// ============================================================

async function main() {
  console.log("\n=== Initializing Admin on Devnet ===\n");

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
  
  if (balance < 0.05 * 1e9) {
    console.error("\n⚠️  Warning: Low SOL balance. You may need to airdrop more SOL.");
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
  console.log("Payment Mint:", PAYMENT_MINT.toBase58());
  console.log("Withdraw Wallet:", WITHDRAW_WALLET.toBase58());

  // Validate addresses
  if (WITHDRAW_WALLET.toBase58() === "YOUR_WITHDRAW_WALLET_ADDRESS_HERE") {
    throw new Error("\n❌ Please set WITHDRAW_WALLET to a valid address in the script!");
  }
  if (OG_COLLECTION_MINT.toBase58() === "YOUR_OG_COLLECTION_MINT_HERE") {
    throw new Error("\n❌ Please set OG_COLLECTION_MINT to a valid address in the script!");
  }
  if (REGULAR_COLLECTION_MINT.toBase58() === "YOUR_REGULAR_COLLECTION_MINT_HERE") {
    throw new Error("\n❌ Please set REGULAR_COLLECTION_MINT to a valid address in the script!");
  }
  if (BASIC_COLLECTION_MINT.toBase58() === "YOUR_BASIC_COLLECTION_MINT_HERE") {
    throw new Error("\n❌ Please set BASIC_COLLECTION_MINT to a valid address in the script!");
  }

  // Derive PDAs
  const [adminState] = PublicKey.findProgramAddressSync(
    [Buffer.from("admin_state")],
    programId
  );
  console.log("Admin State PDA:", adminState.toBase58());

  const [vault] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), PAYMENT_MINT.toBuffer()],
    programId
  );
  console.log("Vault PDA:", vault.toBase58());

  // Check if admin state already exists
  try {
    const existingState = await program.account.adminState.fetch(adminState);
    console.log("\n⚠️  Admin state already exists!");
    console.log("Super admin:", existingState.superAdmin.toBase58());
    console.log("Withdraw wallet:", existingState.withdrawWallet.toBase58());
    console.log("Payment mint:", existingState.paymentMint.toBase58());
    console.log("Mint start date:", existingState.mintStartDate.toString());
    console.log("\nOG Collection:");
    console.log("  - Mint:", existingState.ogCollection.collectionMint.toBase58());
    console.log("  - Fee:", existingState.ogCollection.mintFee.toString());
    console.log("  - Max Supply:", existingState.ogCollection.maxSupply.toString());
    console.log("  - Current Count:", existingState.ogCollection.currentReservedCount.toString());
    console.log("\nRegular Collection:");
    console.log("  - Mint:", existingState.regularCollection.collectionMint.toBase58());
    console.log("  - Fee:", existingState.regularCollection.mintFee.toString());
    console.log("  - Max Supply:", existingState.regularCollection.maxSupply.toString());
    console.log("  - Current Count:", existingState.regularCollection.currentReservedCount.toString());
    console.log("\nBasic Collection:");
    console.log("  - Mint:", existingState.basicCollection.collectionMint.toBase58());
    console.log("  - Fee:", existingState.basicCollection.mintFee.toString());
    console.log("  - Max Supply:", existingState.basicCollection.maxSupply.toString());
    console.log("  - Current Count:", existingState.basicCollection.currentReservedCount.toString());
    return;
  } catch (e) {
    // Account doesn't exist, continue with initialization
    console.log("\nAdmin state not found. Proceeding with initialization...\n");
  }

  // Build and send transaction
  console.log("Parameters:");
  console.log("OG Collection:");
  console.log("  - Mint:", OG_COLLECTION_MINT.toBase58());
  console.log("  - Fee:", OG_MINT_FEE / 10 ** PAYMENT_DECIMALS, "USDC");
  console.log("  - Max Supply:", OG_MAX_SUPPLY);
  console.log("Regular Collection:");
  console.log("  - Mint:", REGULAR_COLLECTION_MINT.toBase58());
  console.log("  - Fee:", REGULAR_MINT_FEE / 10 ** PAYMENT_DECIMALS, "USDC");
  console.log("  - Max Supply:", REGULAR_MAX_SUPPLY);
  console.log("Basic Collection:");
  console.log("  - Mint:", BASIC_COLLECTION_MINT.toBase58());
  console.log("  - Fee:", BASIC_MINT_FEE / 10 ** PAYMENT_DECIMALS, "USDC");
  console.log("  - Max Supply:", BASIC_MAX_SUPPLY);
  console.log("Shared:");
  console.log("  - Withdraw Wallet:", WITHDRAW_WALLET.toBase58());
  console.log("  - Mint Start Date:", MINT_START_DATE === 0 ? "No restriction" : new Date(MINT_START_DATE * 1000).toISOString());
  console.log("");

  try {
    const tx = await program.methods
      .initAdmin(
        OG_COLLECTION_MINT,
        new anchor.BN(OG_MINT_FEE),
        new anchor.BN(OG_MAX_SUPPLY),
        REGULAR_COLLECTION_MINT,
        new anchor.BN(REGULAR_MINT_FEE),
        new anchor.BN(REGULAR_MAX_SUPPLY),
        BASIC_COLLECTION_MINT,
        new anchor.BN(BASIC_MINT_FEE),
        new anchor.BN(BASIC_MAX_SUPPLY),
        WITHDRAW_WALLET,
        new anchor.BN(MINT_START_DATE)
      )
      .accounts({
        superAdmin: wallet.publicKey,
        paymentMint: PAYMENT_MINT,
        paymentTokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc({ skipPreflight: true });

    console.log("✅ Transaction successful!");
    console.log("Transaction signature:", tx);
    console.log(`View on Solana Explorer: https://explorer.solana.com/tx/${tx}?cluster=devnet`);

    // Verify the state
    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for confirmation
    
    const state = await program.account.adminState.fetch(adminState);
    console.log("\n=== Verified Admin State ===");
    console.log("Super admin:", state.superAdmin.toBase58());
    console.log("Withdraw wallet:", state.withdrawWallet.toBase58());
    console.log("Payment mint:", state.paymentMint.toBase58());
    console.log("Mint start date:", state.mintStartDate.toString());
    
    console.log("\nOG Collection:");
    console.log("  - Mint:", state.ogCollection.collectionMint.toBase58());
    console.log("  - Fee:", state.ogCollection.mintFee.toString(), `(${state.ogCollection.mintFee.toNumber() / 10 ** PAYMENT_DECIMALS} USDC)`);
    console.log("  - Max Supply:", state.ogCollection.maxSupply.toString());
    console.log("  - Current Count:", state.ogCollection.currentReservedCount.toString());
    
    console.log("\nRegular Collection:");
    console.log("  - Mint:", state.regularCollection.collectionMint.toBase58());
    console.log("  - Fee:", state.regularCollection.mintFee.toString(), `(${state.regularCollection.mintFee.toNumber() / 10 ** PAYMENT_DECIMALS} USDC)`);
    console.log("  - Max Supply:", state.regularCollection.maxSupply.toString());
    console.log("  - Current Count:", state.regularCollection.currentReservedCount.toString());
    
    console.log("\nBasic Collection:");
    console.log("  - Mint:", state.basicCollection.collectionMint.toBase58());
    console.log("  - Fee:", state.basicCollection.mintFee.toString(), `(${state.basicCollection.mintFee.toNumber() / 10 ** PAYMENT_DECIMALS} USDC)`);
    console.log("  - Max Supply:", state.basicCollection.maxSupply.toString());
    console.log("  - Current Count:", state.basicCollection.currentReservedCount.toString());

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

