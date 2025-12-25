import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { SoulboundNftForReservation } from "../target/types/soulbound_nft_for_reservation";
import {
  TOKEN_PROGRAM_ID,
  createMint,
  mintTo,
  getAccount,
  getAssociatedTokenAddress,
  createAssociatedTokenAccount,
} from "@solana/spl-token";
import {
  PublicKey,
  Keypair,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { expect } from "chai";
import { BN } from "bn.js";

// Test constants
export const MINT_FEE = new BN(1000000); // 1 USDC (6 decimals)
export const MAX_SUPPLY = new BN(1000);
export const MINT_START_DATE = new BN(0); // No restriction for tests
export const DONGLE_PRICE_NFT_HOLDER = new BN(100000000); // 100 USDC
export const DONGLE_PRICE_NORMAL = new BN(499000000); // 499 USDC

// Test users
export interface TestUser {
  keypair: Keypair;
  tokenAccount: PublicKey;
  usdcBalance: BN;
}

// Singleton test context to maintain state across tests
class TestContext {
  private static instance: TestContext;
  public program: Program<SoulboundNftForReservation>;
  public provider: anchor.AnchorProvider;
  public connection: anchor.web3.Connection;

  // Admin and users
  public admin: Keypair;
  public user1: TestUser;
  public user2: TestUser;

  // Tokens
  public usdcMint: PublicKey;
  public adminUsdcAccount: PublicKey;

  // PDAs
  public adminStatePda: PublicKey;
  public adminStateBump: number;
  public vaultPda: PublicKey;
  public vaultBump: number;

  // Collections
  public ogCollectionMint?: PublicKey;
  public dongleProofCollectionMint?: PublicKey;

  // Track if admin is initialized
  public adminInitialized = false;
  public withdrawWallet: Keypair;

  // State tracking
  private initialized = false;

  private constructor() {}

  public static getInstance(): TestContext {
    if (!TestContext.instance) {
      TestContext.instance = new TestContext();
    }
    return TestContext.instance;
  }

  public async initialize(): Promise<void> {
    if (this.initialized) return;

    // Set up Anchor provider
    this.provider = anchor.AnchorProvider.env();
    anchor.setProvider(this.provider);
    this.connection = this.provider.connection;

    // Load the program
    this.program = anchor.workspace.SoulboundNftForReservation as Program<SoulboundNftForReservation>;

    // Create admin keypair
    this.admin = Keypair.generate();
    this.withdrawWallet = Keypair.generate();

    // Airdrop SOL to admin
    await this.airdropSol(this.admin.publicKey, 10);

    // Create USDC mint first
    this.usdcMint = await createMint(
      this.connection,
      this.admin,
      this.admin.publicKey,
      this.admin.publicKey,
      6, // 6 decimals like USDC
      undefined,
      undefined,
      TOKEN_PROGRAM_ID
    );

    // Create admin USDC account
    this.adminUsdcAccount = await createAssociatedTokenAccount(
      this.connection,
      this.admin,
      this.usdcMint,
      this.admin.publicKey
    );

    // Mint USDC to admin
    await mintTo(
      this.connection,
      this.admin,
      this.usdcMint,
      this.adminUsdcAccount,
      this.admin,
      1000000000 // 1000 USDC
    );

    // Create test users (now that USDC mint exists)
    this.user1 = await this.createTestUser(5); // 5 SOL
    this.user2 = await this.createTestUser(5); // 5 SOL

    // Derive PDAs
    [this.adminStatePda, this.adminStateBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("admin_state")],
      this.program.programId
    );

    [this.vaultPda, this.vaultBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), this.usdcMint.toBuffer()],
      this.program.programId
    );

    this.initialized = true;
  }

  private async createTestUser(solAmount: number): Promise<TestUser> {
    const keypair = Keypair.generate();

    // Airdrop SOL
    await this.airdropSol(keypair.publicKey, solAmount);

    // Create USDC token account
    const tokenAccount = await createAssociatedTokenAccount(
      this.connection,
      this.admin,
      this.usdcMint,
      keypair.publicKey
    );

    // Mint some USDC to the user
    await mintTo(
      this.connection,
      this.admin,
      this.usdcMint,
      tokenAccount,
      this.admin,
      500000000 // 500 USDC each
    );

    return {
      keypair,
      tokenAccount,
      usdcBalance: new BN(500000000),
    };
  }

  public async airdropSol(publicKey: PublicKey, amount: number): Promise<void> {
    const signature = await this.connection.requestAirdrop(
      publicKey,
      amount * LAMPORTS_PER_SOL
    );
    await this.connection.confirmTransaction(signature);
  }

  // Helper to get user state PDA
  public getUserStatePda(userPubkey: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("user_state"), userPubkey.toBuffer()],
      this.program.programId
    );
  }

  // Helper to get metadata PDA (Metaplex standard)
  public getMetadataPda(mint: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [
        Buffer.from("metadata"),
        new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s").toBuffer(),
        mint.toBuffer(),
      ],
      new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s")
    );
  }

  // Helper to get master edition PDA (Metaplex standard)
  public getMasterEditionPda(mint: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [
        Buffer.from("metadata"),
        new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s").toBuffer(),
        mint.toBuffer(),
        Buffer.from("edition"),
      ],
      new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s")
    );
  }

  // Helper to fetch admin state
  public async fetchAdminState(): Promise<any> {
    return await this.program.account.adminState.fetch(this.adminStatePda);
  }

  // Helper to fetch user state
  public async fetchUserState(userPubkey: PublicKey): Promise<any> {
    const [userStatePda] = this.getUserStatePda(userPubkey);
    return await this.program.account.userState.fetch(userStatePda);
  }

  // Helper to fetch collection state
  public async fetchCollectionState(collectionMint: PublicKey): Promise<any> {
    const [collectionStatePda] = PublicKey.findProgramAddressSync(
      [Buffer.from("collection"), collectionMint.toBuffer()],
      this.program.programId
    );
    return await this.program.account.collectionState.fetch(collectionStatePda);
  }

  // Helper to mint USDC to a user
  public async mintUsdcTo(destination: PublicKey, amount: number): Promise<void> {
    await mintTo(
      this.connection,
      this.admin,
      this.usdcMint,
      destination,
      this.admin,
      amount
    );
  }

  // Helper to get vault balance as number
  public async getVaultBalance(): Promise<bigint> {
    const vaultAccount = await getAccount(this.connection, this.vaultPda);
    return vaultAccount.amount;
  }
}

// Export singleton instance
export const testContext = TestContext.getInstance();

// Initialize context before tests
export const initializeTestContext = async (): Promise<void> => {
  await testContext.initialize();
};

// Helper to create withdraw wallet keypair
export const createWithdrawWallet = (): Keypair => {
  return Keypair.generate();
};

// Helper to assert admin state values
export const assertAdminState = async (
  expectedValues: Partial<{
    superAdmin: PublicKey;
    withdrawWallet: PublicKey;
    mintFee: BN;
    maxSupply: BN;
    mintStartDate: BN;
    donglePriceNftHolder: BN;
    donglePriceNormal: BN;
    purchaseStarted: boolean;
    ogCollection: PublicKey;
    dongleProofCollection: PublicKey;
  }>
): Promise<void> => {
  const adminState = await testContext.fetchAdminState();

  if (expectedValues.superAdmin) {
    expect(adminState.superAdmin.toString()).to.equal(expectedValues.superAdmin.toString());
  }
  if (expectedValues.withdrawWallet) {
    expect(adminState.withdrawWallet.toString()).to.equal(expectedValues.withdrawWallet.toString());
  }
  if (expectedValues.mintFee) {
    expect(adminState.mintFee.toString()).to.equal(expectedValues.mintFee.toString());
  }
  if (expectedValues.maxSupply) {
    expect(adminState.maxSupply.toString()).to.equal(expectedValues.maxSupply.toString());
  }
  if (expectedValues.mintStartDate !== undefined) {
    expect(adminState.mintStartDate.toString()).to.equal(expectedValues.mintStartDate.toString());
  }
  if (expectedValues.donglePriceNftHolder) {
    expect(adminState.donglePriceNftHolder.toString()).to.equal(expectedValues.donglePriceNftHolder.toString());
  }
  if (expectedValues.donglePriceNormal) {
    expect(adminState.donglePriceNormal.toString()).to.equal(expectedValues.donglePriceNormal.toString());
  }
  if (expectedValues.purchaseStarted !== undefined) {
    expect(adminState.purchaseStarted).to.equal(expectedValues.purchaseStarted);
  }
  if (expectedValues.ogCollection) {
    expect(adminState.ogCollection.toString()).to.equal(expectedValues.ogCollection.toString());
  }
  if (expectedValues.dongleProofCollection) {
    expect(adminState.dongleProofCollection.toString()).to.equal(expectedValues.dongleProofCollection.toString());
  }
};