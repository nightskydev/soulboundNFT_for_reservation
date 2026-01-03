import * as anchor from "@coral-xyz/anchor";
import { expect } from "chai";
import {
  testContext,
  initializeTestContext,
  OG_MINT_FEE,
  OG_MAX_SUPPLY,
  REGULAR_MINT_FEE,
  REGULAR_MAX_SUPPLY,
  BASIC_MINT_FEE,
  BASIC_MAX_SUPPLY,
  MINT_START_DATE,
  assertAdminState,
} from "./setup";
import { PublicKey, Keypair } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { BN } from "bn.js";

describe("init_admin", () => {
  before(async () => {
    await initializeTestContext();
  });

  it("should initialize admin state successfully", async () => {
    // Skip if already initialized
    if (testContext.adminInitialized) {
      console.log("Admin already initialized, skipping...");
      return;
    }

    // Create placeholder collection mints (actual collection NFTs created in tests that need them)
    testContext.ogCollectionMint = Keypair.generate().publicKey;
    testContext.regularCollectionMint = Keypair.generate().publicKey;
    testContext.basicCollectionMint = Keypair.generate().publicKey;

    // Initialize admin
    const tx = await testContext.program.methods
      .initAdmin(
        testContext.ogCollectionMint,
        OG_MINT_FEE,
        OG_MAX_SUPPLY,
        testContext.regularCollectionMint,
        REGULAR_MINT_FEE,
        REGULAR_MAX_SUPPLY,
        testContext.basicCollectionMint,
        BASIC_MINT_FEE,
        BASIC_MAX_SUPPLY,
        testContext.withdrawWallet.publicKey,
        MINT_START_DATE
      )
      .accounts({
        superAdmin: testContext.admin.publicKey,
        adminState: testContext.adminStatePda,
        paymentMint: testContext.usdcMint,
        vault: testContext.vaultPda,
        paymentTokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .signers([testContext.admin])
      .rpc();

    // Verify transaction succeeded
    expect(tx).to.be.a("string");
    testContext.adminInitialized = true;

    // Verify admin state was created correctly
    await assertAdminState({
      superAdmin: testContext.admin.publicKey,
      withdrawWallet: testContext.withdrawWallet.publicKey,
      mintStartDate: MINT_START_DATE,
      ogCollection: {
        collectionMint: testContext.ogCollectionMint,
        mintFee: OG_MINT_FEE,
        maxSupply: OG_MAX_SUPPLY,
        currentReservedCount: new BN(0),
      },
      regularCollection: {
        collectionMint: testContext.regularCollectionMint,
        mintFee: REGULAR_MINT_FEE,
        maxSupply: REGULAR_MAX_SUPPLY,
        currentReservedCount: new BN(0),
      },
      basicCollection: {
        collectionMint: testContext.basicCollectionMint,
        mintFee: BASIC_MINT_FEE,
        maxSupply: BASIC_MAX_SUPPLY,
        currentReservedCount: new BN(0),
      },
    });

    // Verify vault was created
    const vaultAccount = await testContext.connection.getAccountInfo(testContext.vaultPda);
    expect(vaultAccount).to.not.be.null;
    expect(vaultAccount!.owner.toString()).to.equal(TOKEN_PROGRAM_ID.toString());
  });

  it("should verify all collection counts start at 0", async () => {
    const adminState = await testContext.fetchAdminState();
    expect(adminState.ogCollection.currentReservedCount.toNumber()).to.equal(0);
    expect(adminState.regularCollection.currentReservedCount.toNumber()).to.equal(0);
    expect(adminState.basicCollection.currentReservedCount.toNumber()).to.equal(0);
  });

  it("should verify payment_mint is set correctly", async () => {
    const adminState = await testContext.fetchAdminState();
    expect(adminState.paymentMint.toString()).to.equal(testContext.usdcMint.toString());
  });
});