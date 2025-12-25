import * as anchor from "@coral-xyz/anchor";
import { expect } from "chai";
import {
  testContext,
  initializeTestContext,
  MINT_FEE,
  MAX_SUPPLY,
  MINT_START_DATE,
  DONGLE_PRICE_NFT_HOLDER,
  DONGLE_PRICE_NORMAL,
  assertAdminState,
} from "./setup";
import { PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";

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

    // Initialize admin
    const tx = await testContext.program.methods
      .initAdmin(
        MINT_FEE,
        MAX_SUPPLY,
        testContext.withdrawWallet.publicKey,
        MINT_START_DATE,
        DONGLE_PRICE_NFT_HOLDER,
        DONGLE_PRICE_NORMAL
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
      mintFee: MINT_FEE,
      maxSupply: MAX_SUPPLY,
      mintStartDate: MINT_START_DATE,
      donglePriceNftHolder: DONGLE_PRICE_NFT_HOLDER,
      donglePriceNormal: DONGLE_PRICE_NORMAL,
      purchaseStarted: false,
      ogCollection: PublicKey.default,
      dongleProofCollection: PublicKey.default,
    });

    // Verify vault was created
    const vaultAccount = await testContext.connection.getAccountInfo(testContext.vaultPda);
    expect(vaultAccount).to.not.be.null;
    expect(vaultAccount!.owner.toString()).to.equal(TOKEN_PROGRAM_ID.toString());
  });

  it("should verify current_reserved_count starts at 0", async () => {
    const adminState = await testContext.fetchAdminState();
    expect(adminState.currentReservedCount.toNumber()).to.equal(0);
  });

  it("should verify payment_mint is set correctly", async () => {
    const adminState = await testContext.fetchAdminState();
    expect(adminState.paymentMint.toString()).to.equal(testContext.usdcMint.toString());
  });
});