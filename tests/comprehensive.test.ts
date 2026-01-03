import * as anchor from "@coral-xyz/anchor";
import { expect } from "chai";
import { 
  testContext, 
  initializeTestContext, 
  OG_MINT_FEE,
  REGULAR_MINT_FEE,
  BASIC_MINT_FEE,
  OG_MAX_SUPPLY,
  REGULAR_MAX_SUPPLY,
  BASIC_MAX_SUPPLY,
  MINT_START_DATE
} from "./setup";
import { Keypair, PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, createMint } from "@solana/spl-token";
import { BN } from "bn.js";

describe("Complete User Journey (Admin + Basic Operations)", () => {
  before(async () => {
    await initializeTestContext();
  });

  it("should complete full admin and basic operations journey", async () => {
    // ===== PHASE 1: Admin Setup =====
    console.log("🚀 Phase 1: Admin Setup");

    // Initialize admin if not done
    if (!testContext.adminInitialized) {
      // Create collection mints
      testContext.ogCollectionMint = await createMint(
        testContext.connection,
        testContext.admin,
        testContext.admin.publicKey,
        testContext.admin.publicKey,
        0,
        Keypair.generate(),
        undefined,
        TOKEN_PROGRAM_ID
      );

      testContext.regularCollectionMint = await createMint(
        testContext.connection,
        testContext.admin,
        testContext.admin.publicKey,
        testContext.admin.publicKey,
        0,
        Keypair.generate(),
        undefined,
        TOKEN_PROGRAM_ID
      );

      testContext.basicCollectionMint = await createMint(
        testContext.connection,
        testContext.admin,
        testContext.admin.publicKey,
        testContext.admin.publicKey,
        0,
        Keypair.generate(),
        undefined,
        TOKEN_PROGRAM_ID
      );

      const initTx = await testContext.program.methods
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
          paymentMint: testContext.usdcMint,
          paymentTokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([testContext.admin])
        .rpc();

      console.log("✅ Admin initialized:", initTx);
      testContext.adminInitialized = true;
    } else {
      console.log("✅ Admin already initialized");
    }

    // Update withdraw wallet to admin if different
    const currentAdminState = await testContext.fetchAdminState();
    if (currentAdminState.withdrawWallet.toString() !== testContext.admin.publicKey.toString()) {
      await testContext.program.methods
        .updateWithdrawWallet(testContext.admin.publicKey)
        .accounts({
          superAdmin: testContext.admin.publicKey,
        })
        .signers([testContext.admin])
        .rpc();
    }

    console.log("✅ Admin setup complete");

    // ===== PHASE 2: Admin State Verification =====
    console.log("✅ Phase 2: Admin State Verification");

    const adminState = await testContext.fetchAdminState();
    expect(adminState.superAdmin.toString()).to.equal(testContext.admin.publicKey.toString());
    
    // Verify collections are set
    expect(adminState.ogCollection).to.exist;
    expect(adminState.regularCollection).to.exist;
    expect(adminState.basicCollection).to.exist;

    console.log("🎉 Complete user journey test passed!");
    console.log("📊 Final Statistics:");
    console.log("   • Admin initialized successfully");
    console.log("   • Super Admin:", adminState.superAdmin.toBase58());
  });

  it("should handle admin update operations", async () => {
    console.log("🧪 Testing admin update operations");

    // Update OG collection mint fee
    const newMintFee = new anchor.BN(7000000); // 7 USDC
    await testContext.program.methods
      .updateMintFee({ og: {} }, newMintFee)
      .accounts({
        superAdmin: testContext.admin.publicKey,
      })
      .signers([testContext.admin])
      .rpc();

    const adminState = await testContext.fetchAdminState();
    expect(adminState.ogCollection.mintFee.toString()).to.equal(newMintFee.toString());

    console.log("✅ Admin updates handled correctly");
  });
});
