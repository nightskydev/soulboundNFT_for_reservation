import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { SoulboundNftForReservation } from "../target/types/soulbound_nft_for_reservation";
import {
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createMint,
  createAssociatedTokenAccount,
  mintTo,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { Keypair, PublicKey } from "@solana/web3.js";

// Shared test context - persists across all test files
export class TestContext {
  private static instance: TestContext;
  private initialized = false;

  // Provider and program
  provider: anchor.AnchorProvider;
  program: Program<SoulboundNftForReservation>;

  // Accounts
  superAdmin: anchor.Wallet;
  withdrawWallet: Keypair;
  newWithdrawWallet: Keypair;
  user: Keypair;
  user2: Keypair; // Second user for testing
  user3: Keypair; // Third user for collection NFT testing

  // Admin and payment related
  adminState: PublicKey;
  paymentMint: PublicKey;
  wrongPaymentMint: PublicKey; // For testing invalid payment mint
  userTokenAccount: PublicKey;
  user2TokenAccount: PublicKey;
  user3TokenAccount: PublicKey;
  withdrawWalletTokenAccount: PublicKey;
  newWithdrawWalletTokenAccount: PublicKey;
  vault: PublicKey;

  // Track minted NFT for burn tests
  mintedNftMint: PublicKey | null = null;
  mintedNftTokenAccount: PublicKey | null = null;

  // Collection related
  ogCollectionMint: PublicKey | null = null;
  dongleProofCollectionMint: PublicKey | null = null;
  collectionNftMint: PublicKey | null = null;
  collectionNftTokenAccount: PublicKey | null = null;

  // Constants
  readonly PAYMENT_DECIMALS = 6;
  readonly MINT_FEE = 1_000_000; // 1 USDC
  readonly MAX_SUPPLY = 100;
  readonly DONGLE_PRICE_NFT_HOLDER = 100_000_000; // 100 USDC
  readonly DONGLE_PRICE_NORMAL = 499_000_000; // 499 USDC

  private constructor() {
    this.provider = anchor.AnchorProvider.env();
    anchor.setProvider(this.provider);

    this.program = anchor.workspace
      .SoulboundNftForReservation as Program<SoulboundNftForReservation>;

    this.superAdmin = this.provider.wallet as anchor.Wallet;

    // Create keypairs
    this.withdrawWallet = Keypair.generate();
    this.newWithdrawWallet = Keypair.generate();
    this.user = Keypair.generate();
    this.user2 = Keypair.generate();
    this.user3 = Keypair.generate();
  }

  static getInstance(): TestContext {
    if (!TestContext.instance) {
      TestContext.instance = new TestContext();
    }
    return TestContext.instance;
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    console.log("\n=== Setting up Test Context ===\n");

    // Create mock USDC mint
    this.paymentMint = await createMint(
      this.provider.connection,
      this.superAdmin.payer,
      this.superAdmin.publicKey,
      null,
      this.PAYMENT_DECIMALS,
      undefined,
      undefined,
      TOKEN_PROGRAM_ID
    );
    console.log("Payment mint:", this.paymentMint.toBase58());

    // Create wrong payment mint for testing
    this.wrongPaymentMint = await createMint(
      this.provider.connection,
      this.superAdmin.payer,
      this.superAdmin.publicKey,
      null,
      this.PAYMENT_DECIMALS,
      undefined,
      undefined,
      TOKEN_PROGRAM_ID
    );
    console.log("Wrong payment mint:", this.wrongPaymentMint.toBase58());

    // Derive admin state PDA
    [this.adminState] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("admin_state")],
      this.program.programId
    );
    console.log("Admin state PDA:", this.adminState.toBase58());

    // Derive vault PDA
    [this.vault] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("vault"), this.paymentMint.toBuffer()],
      this.program.programId
    );
    console.log("Vault PDA:", this.vault.toBase58());

    // Create withdraw wallet token accounts
    this.withdrawWalletTokenAccount = await createAssociatedTokenAccount(
      this.provider.connection,
      this.superAdmin.payer,
      this.paymentMint,
      this.withdrawWallet.publicKey,
      undefined,
      TOKEN_PROGRAM_ID
    );

    this.newWithdrawWalletTokenAccount = await createAssociatedTokenAccount(
      this.provider.connection,
      this.superAdmin.payer,
      this.paymentMint,
      this.newWithdrawWallet.publicKey,
      undefined,
      TOKEN_PROGRAM_ID
    );

    // Airdrop SOL to users
    const airdropTargets = [
      this.user,
      this.user2,
      this.user3,
    ];
    for (const target of airdropTargets) {
      const sig = await this.provider.connection.requestAirdrop(
        target.publicKey,
        2e9
      );
      await this.provider.connection.confirmTransaction(sig, "confirmed");
    }

    // Create user's token account and mint USDC
    this.userTokenAccount = await createAssociatedTokenAccount(
      this.provider.connection,
      this.superAdmin.payer,
      this.paymentMint,
      this.user.publicKey,
      undefined,
      TOKEN_PROGRAM_ID
    );

    await mintTo(
      this.provider.connection,
      this.superAdmin.payer,
      this.paymentMint,
      this.userTokenAccount,
      this.superAdmin.publicKey,
      100 * 10 ** this.PAYMENT_DECIMALS,
      [],
      undefined,
      TOKEN_PROGRAM_ID
    );

    // Create user2's token account and mint USDC
    this.user2TokenAccount = await createAssociatedTokenAccount(
      this.provider.connection,
      this.superAdmin.payer,
      this.paymentMint,
      this.user2.publicKey,
      undefined,
      TOKEN_PROGRAM_ID
    );

    await mintTo(
      this.provider.connection,
      this.superAdmin.payer,
      this.paymentMint,
      this.user2TokenAccount,
      this.superAdmin.publicKey,
      100 * 10 ** this.PAYMENT_DECIMALS,
      [],
      undefined,
      TOKEN_PROGRAM_ID
    );

    // Create user3's token account and mint USDC
    this.user3TokenAccount = await createAssociatedTokenAccount(
      this.provider.connection,
      this.superAdmin.payer,
      this.paymentMint,
      this.user3.publicKey,
      undefined,
      TOKEN_PROGRAM_ID
    );

    await mintTo(
      this.provider.connection,
      this.superAdmin.payer,
      this.paymentMint,
      this.user3TokenAccount,
      this.superAdmin.publicKey,
      100 * 10 ** this.PAYMENT_DECIMALS,
      [],
      undefined,
      TOKEN_PROGRAM_ID
    );

    console.log("Super admin:", this.superAdmin.publicKey.toBase58());
    console.log("Withdraw wallet:", this.withdrawWallet.publicKey.toBase58());
    console.log("New withdraw wallet:", this.newWithdrawWallet.publicKey.toBase58());
    console.log("User:", this.user.publicKey.toBase58());
    console.log("User 2:", this.user2.publicKey.toBase58());
    console.log("User 3:", this.user3.publicKey.toBase58());

    this.initialized = true;
  }

  async getAdminStatePDA(): Promise<PublicKey> {
    const [adminState] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("admin_state")],
      this.program.programId
    );
    return adminState;
  }

  async getUserStatePDA(user: PublicKey): Promise<PublicKey> {
    const [userState] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("user_state"), user.toBuffer()],
      this.program.programId
    );
    return userState;
  }

  async getCollectionStatePDA(collectionMint: PublicKey): Promise<PublicKey> {
    const [collectionState] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("collection"), collectionMint.toBuffer()],
      this.program.programId
    );
    return collectionState;
  }

  async fetchAdminState() {
    const adminState = await this.getAdminStatePDA();
    return this.program.account.adminState.fetch(adminState);
  }

  async fetchUserState(user: PublicKey) {
    const userState = await this.getUserStatePDA(user);
    return this.program.account.userState.fetch(userState);
  }

  // Helper to get token account address for NFT
  getNftTokenAccount(mint: PublicKey, owner: PublicKey): PublicKey {
    return getAssociatedTokenAddressSync(
      mint,
      owner,
      false,
      TOKEN_2022_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );
  }
}

// Export singleton instance
export const ctx = TestContext.getInstance();

// Export common imports for test files
export {
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
};
