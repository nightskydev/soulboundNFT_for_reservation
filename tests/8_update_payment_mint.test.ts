import * as anchor from "@coral-xyz/anchor";
import { expect } from "chai";
import { testContext, initializeTestContext, MINT_FEE, MAX_SUPPLY, MINT_START_DATE } from "./setup";
import { Keypair, PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, createMint, getAccount } from "@solana/spl-token";

describe("update_payment_mint", () => {
  before(async () => {
    await initializeTestContext();

    // Initialize admin if not already done
    if (!testContext.adminInitialized) {
      await testContext.program.methods
        .initAdmin(
          MINT_FEE,
          MAX_SUPPLY,
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
      testContext.adminInitialized = true;
    }

    // Update withdraw wallet if different
    const adminState = await testContext.fetchAdminState();
    if (adminState.withdrawWallet.toString() !== testContext.admin.publicKey.toString()) {
      await testContext.program.methods
        .updateWithdrawWallet(testContext.admin.publicKey)
        .accounts({
          superAdmin: testContext.admin.publicKey,
          adminState: testContext.adminStatePda,
        })
        .signers([testContext.admin])
        .rpc();
    }
  });

  it("should update payment mint successfully when vault is empty", async () => {
    // Ensure vault is empty first
    const vaultBalance = await testContext.getVaultBalance();
    if (vaultBalance > BigInt(0)) {
      // Withdraw all funds
      await testContext.program.methods
        .withdrawAll()
        .accounts({
          superAdmin: testContext.admin.publicKey,
          adminState: testContext.adminStatePda,
          paymentMint: testContext.usdcMint,
          vault: testContext.vaultPda,
          withdrawTokenAccount: testContext.adminUsdcAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([testContext.admin])
        .rpc();
    }

    // Create a new payment mint (different token)
    const newPaymentMint = await createMint(
      testContext.connection,
      testContext.admin,
      testContext.admin.publicKey,
      testContext.admin.publicKey,
      6, // Same decimals as USDC
      undefined,
      undefined,
      TOKEN_PROGRAM_ID
    );

    // Derive new vault PDA
    const [newVaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), newPaymentMint.toBuffer()],
      testContext.program.programId
    );

    // Update payment mint
    const tx = await testContext.program.methods
      .updatePaymentMint()
      .accounts({
        superAdmin: testContext.admin.publicKey,
        adminState: testContext.adminStatePda,
        oldPaymentMint: testContext.usdcMint,
        oldVault: testContext.vaultPda,
        oldPaymentTokenProgram: TOKEN_PROGRAM_ID,
        newPaymentMint: newPaymentMint,
        newVault: newVaultPda,
        newPaymentTokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([testContext.admin])
      .rpc();

    expect(tx).to.be.a("string");

    // Verify admin state was updated
    const adminState = await testContext.fetchAdminState();
    expect(adminState.paymentMint.toString()).to.equal(newPaymentMint.toString());

    // Switch back to USDC for other tests
    const tx2 = await testContext.program.methods
      .updatePaymentMint()
      .accounts({
        superAdmin: testContext.admin.publicKey,
        adminState: testContext.adminStatePda,
        oldPaymentMint: newPaymentMint,
        oldVault: newVaultPda,
        oldPaymentTokenProgram: TOKEN_PROGRAM_ID,
        newPaymentMint: testContext.usdcMint,
        newVault: testContext.vaultPda,
        newPaymentTokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([testContext.admin])
      .rpc();

    expect(tx2).to.be.a("string");
  });

  it("should fail when trying to set same payment mint", async () => {
    try {
      await testContext.program.methods
        .updatePaymentMint()
        .accounts({
          superAdmin: testContext.admin.publicKey,
          adminState: testContext.adminStatePda,
          oldPaymentMint: testContext.usdcMint,
          oldVault: testContext.vaultPda,
          oldPaymentTokenProgram: TOKEN_PROGRAM_ID,
          newPaymentMint: testContext.usdcMint, // Same mint
          newVault: testContext.vaultPda,
          newPaymentTokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([testContext.admin])
        .rpc();

      expect.fail("Expected transaction to fail with same payment mint");
    } catch (error: any) {
      expect(error.toString()).to.include("SamePaymentMint");
    }
  });

  it("should fail when non-admin tries to update payment mint", async () => {
    const differentMint = await createMint(
      testContext.connection,
      testContext.admin,
      testContext.admin.publicKey,
      testContext.admin.publicKey,
      6,
      undefined,
      undefined,
      TOKEN_PROGRAM_ID
    );

    const [differentVaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), differentMint.toBuffer()],
      testContext.program.programId
    );

    try {
      await testContext.program.methods
        .updatePaymentMint()
        .accounts({
          superAdmin: testContext.user1.keypair.publicKey, // Non-admin
          adminState: testContext.adminStatePda,
          oldPaymentMint: testContext.usdcMint,
          oldVault: testContext.vaultPda,
          oldPaymentTokenProgram: TOKEN_PROGRAM_ID,
          newPaymentMint: differentMint,
          newVault: differentVaultPda,
          newPaymentTokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([testContext.user1.keypair])
        .rpc();

      expect.fail("Expected transaction to fail with non-admin signer");
    } catch (error: any) {
      expect(error.toString()).to.include("Unauthorized");
    }
  });
});