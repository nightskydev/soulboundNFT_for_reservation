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
const MINT_FEE = 1_000_000; // 1 USDC (1 * 10^6)
const MAX_SUPPLY = 10000; // Maximum number of NFTs that can be minted
const MINT_START_DATE = 0; // 0 = no time restriction, or set Unix timestamp
const DONGLE_PRICE_NFT_HOLDER = 100_000_000; // 100 USDC
const DONGLE_PRICE_NORMAL = 499_000_000; // 499 USDC

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
  const programId = new PublicKey("7nwJWSLt65ZWBzBwSt9FTSF94phiafpj3NYzA7rm2Qb2");
  const program = new Program<SoulboundNftForReservation>(idl, provider);

  console.log("Program ID:", programId.toBase58());
  console.log("Payment Mint:", PAYMENT_MINT.toBase58());
  console.log("Withdraw Wallet:", WITHDRAW_WALLET.toBase58());

  // Validate withdraw wallet
  if (WITHDRAW_WALLET.toBase58() === "YOUR_WITHDRAW_WALLET_ADDRESS_HERE") {
    throw new Error("\n❌ Please set WITHDRAW_WALLET to a valid address in the script!");
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
    console.log("Mint fee:", existingState.mintFee.toString());
    console.log("Max supply:", existingState.maxSupply.toString());
    console.log("Payment mint:", existingState.paymentMint.toBase58());
    return;
  } catch (e) {
    // Account doesn't exist, continue with initialization
    console.log("\nAdmin state not found. Proceeding with initialization...\n");
  }

  // Build and send transaction
  console.log("Parameters:");
  console.log("  - Mint Fee:", MINT_FEE / 10 ** PAYMENT_DECIMALS, "USDC");
  console.log("  - Max Supply:", MAX_SUPPLY);
  console.log("  - Mint Start Date:", MINT_START_DATE === 0 ? "No restriction" : new Date(MINT_START_DATE * 1000).toISOString());
  console.log("  - Dongle Price (NFT Holder):", DONGLE_PRICE_NFT_HOLDER / 10 ** PAYMENT_DECIMALS, "USDC");
  console.log("  - Dongle Price (Normal):", DONGLE_PRICE_NORMAL / 10 ** PAYMENT_DECIMALS, "USDC");
  console.log("");

  try {
    const tx = await program.methods
      .initAdmin(
        new anchor.BN(MINT_FEE),
        new anchor.BN(MAX_SUPPLY),
        WITHDRAW_WALLET,
        new anchor.BN(MINT_START_DATE),
        new anchor.BN(DONGLE_PRICE_NFT_HOLDER),
        new anchor.BN(DONGLE_PRICE_NORMAL)
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
    console.log("Mint fee:", state.mintFee.toString());
    console.log("Max supply:", state.maxSupply.toString());
    console.log("Current reserved count:", state.currentReservedCount.toString());
    console.log("Payment mint:", state.paymentMint.toBase58());
    console.log("Mint start date:", state.mintStartDate.toString());
    console.log("Dongle price (NFT holder):", state.donglePriceNftHolder.toString());
    console.log("Dongle price (Normal):", state.donglePriceNormal.toString());
    console.log("Purchase started:", state.purchaseStarted);

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

