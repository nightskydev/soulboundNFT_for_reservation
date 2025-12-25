import * as anchor from "@coral-xyz/anchor";
import { expect } from "chai";
import { testContext, initializeTestContext, MINT_FEE, MAX_SUPPLY, MINT_START_DATE, DONGLE_PRICE_NFT_HOLDER, DONGLE_PRICE_NORMAL } from "./setup";
import { Keypair, PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getAccount, createAssociatedTokenAccount, mintTo } from "@solana/spl-token";

describe("Complete User Journey (Admin + Commerce)", () => {
  before(async () => {
    await initializeTestContext();
  });

  it("should complete full admin and commerce journey", async () => {
    // ===== PHASE 1: Admin Setup =====
    console.log("🚀 Phase 1: Admin Setup");

    // Initialize admin if not done
    if (!testContext.adminInitialized) {
      const initTx = await testContext.program.methods
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

    // Enable purchases
    await testContext.program.methods
      .updatePurchaseStarted(true)
      .accounts({
        superAdmin: testContext.admin.publicKey,
      })
      .signers([testContext.admin])
      .rpc();

    console.log("✅ Purchase started enabled");

    // Set reasonable dongle prices for testing
    await testContext.program.methods
      .updateDonglePriceNftHolder(new anchor.BN(10000000)) // 10 USDC
      .accounts({
        superAdmin: testContext.admin.publicKey,
      })
      .signers([testContext.admin])
      .rpc();

    await testContext.program.methods
      .updateDonglePriceNormal(new anchor.BN(50000000)) // 50 USDC
      .accounts({
        superAdmin: testContext.admin.publicKey,
      })
      .signers([testContext.admin])
      .rpc();

    console.log("✅ Dongle prices updated");

    // ===== PHASE 2: Dongle Purchasing =====
    console.log("🛒 Phase 2: Dongle Purchasing");

    // Create a new user and make a purchase
    const newUser = Keypair.generate();
    await testContext.connection.confirmTransaction(
      await testContext.connection.requestAirdrop(newUser.publicKey, 10 * anchor.web3.LAMPORTS_PER_SOL)
    );

    const newUserUsdcAccount = await createAssociatedTokenAccount(
      testContext.connection,
      testContext.admin,
      testContext.usdcMint,
      newUser.publicKey
    );

    await mintTo(
      testContext.connection,
      testContext.admin,
      testContext.usdcMint,
      newUserUsdcAccount,
      testContext.admin,
      100000000 // 100 USDC
    );

    const vaultBalanceBefore = await testContext.getVaultBalance();

    // New user purchases dongle at normal price (no NFT)
    const [newUserStatePda] = testContext.getUserStatePda(newUser.publicKey);
    const purchaseTx = await testContext.program.methods
      .purchaseDongle()
      .accounts({
        buyer: newUser.publicKey,
        paymentMint: testContext.usdcMint,
        buyerTokenAccount: newUserUsdcAccount,
        paymentTokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([newUser])
      .rpc();

    console.log("✅ User purchased dongle:", purchaseTx);

    // Verify user state
    const userState = await testContext.fetchUserState(newUser.publicKey);
    expect(userState.purchasedDate.toNumber()).to.be.greaterThan(0);

    // Verify vault balance increased
    const vaultBalanceAfter = await testContext.getVaultBalance();
    expect(Number(vaultBalanceAfter)).to.be.greaterThan(Number(vaultBalanceBefore));

    console.log("✅ Vault balance increased by", Number(vaultBalanceAfter - vaultBalanceBefore) / 1000000, "USDC");

    // ===== PHASE 3: Fund Management =====
    console.log("💰 Phase 3: Fund Management");

    // Check vault balance
    const vaultBalance = await testContext.getVaultBalance();
    console.log("💰 Vault balance:", Number(vaultBalance) / 1000000, "USDC");

    // Withdraw some funds
    const withdrawAmount = vaultBalance / BigInt(2);
    const withdrawTx = await testContext.program.methods
      .withdraw(new anchor.BN(withdrawAmount.toString()))
      .accounts({
        superAdmin: testContext.admin.publicKey,
        paymentMint: testContext.usdcMint,
        withdrawTokenAccount: testContext.adminUsdcAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([testContext.admin])
      .rpc();

    console.log("✅ Withdrew funds:", withdrawTx);

    // Withdraw remaining funds
    const withdrawAllTx = await testContext.program.methods
      .withdrawAll()
      .accounts({
        superAdmin: testContext.admin.publicKey,
        paymentMint: testContext.usdcMint,
        withdrawTokenAccount: testContext.adminUsdcAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([testContext.admin])
      .rpc();

    console.log("✅ Withdrew all remaining funds:", withdrawAllTx);

    // Verify vault is empty
    const finalVaultBalance = await testContext.getVaultBalance();
    expect(Number(finalVaultBalance)).to.equal(0);

    // ===== PHASE 4: Admin Update Verification =====
    console.log("✅ Phase 4: Admin State Verification");

    const adminState = await testContext.fetchAdminState();
    expect(adminState.purchaseStarted).to.be.true;
    expect(adminState.donglePriceNormal.toNumber()).to.equal(50000000);
    expect(adminState.donglePriceNftHolder.toNumber()).to.equal(10000000);

    console.log("🎉 Complete user journey test passed!");
    console.log("📊 Final Statistics:");
    console.log("   • Dongles purchased: 1");
    console.log("   • Funds in vault: 0 (all withdrawn)");
  });

  it("should handle error scenarios gracefully", async () => {
    console.log("🧪 Testing error scenarios");

    // Disable purchases
    await testContext.program.methods
      .updatePurchaseStarted(false)
      .accounts({
        superAdmin: testContext.admin.publicKey,
      })
      .signers([testContext.admin])
      .rpc();

    // Try to purchase dongle when disabled
    const tempUser = Keypair.generate();
    await testContext.connection.confirmTransaction(
      await testContext.connection.requestAirdrop(tempUser.publicKey, 5 * anchor.web3.LAMPORTS_PER_SOL)
    );

    const tempUserUsdcAccount = await createAssociatedTokenAccount(
      testContext.connection,
      testContext.admin,
      testContext.usdcMint,
      tempUser.publicKey
    );

    await mintTo(
      testContext.connection,
      testContext.admin,
      testContext.usdcMint,
      tempUserUsdcAccount,
      testContext.admin,
      100000000 // 100 USDC
    );

    const [tempUserStatePda] = testContext.getUserStatePda(tempUser.publicKey);

    try {
      await testContext.program.methods
        .purchaseDongle()
        .accounts({
          buyer: tempUser.publicKey,
          paymentMint: testContext.usdcMint,
          buyerTokenAccount: tempUserUsdcAccount,
          paymentTokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([tempUser])
        .rpc();

      expect.fail("Should have failed when purchase not started");
    } catch (error: any) {
      expect(error.toString()).to.include("PurchaseNotStarted");
      console.log("✅ Correctly rejected purchase when disabled");
    }

    // Re-enable purchases
    await testContext.program.methods
      .updatePurchaseStarted(true)
      .accounts({
        superAdmin: testContext.admin.publicKey,
      })
      .signers([testContext.admin])
      .rpc();

    console.log("✅ Error scenarios handled correctly");
  });
});