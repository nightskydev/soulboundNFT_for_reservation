import * as anchor from "@coral-xyz/anchor";
import { expect } from "chai";
import { testContext, initializeTestContext, MINT_FEE, MAX_SUPPLY, MINT_START_DATE, DONGLE_PRICE_NFT_HOLDER, DONGLE_PRICE_NORMAL } from "./setup";
import { Keypair, PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getAccount, createAssociatedTokenAccount, mintTo } from "@solana/spl-token";

describe("withdraw", () => {
  before(async () => {
    await initializeTestContext();

    // Initialize admin if not already done
    if (!testContext.adminInitialized) {
      await testContext.program.methods
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
      testContext.adminInitialized = true;
    }

    // Enable purchases and set prices
    await testContext.program.methods
      .updatePurchaseStarted(true)
      .accounts({
        superAdmin: testContext.admin.publicKey,
        adminState: testContext.adminStatePda,
      })
      .signers([testContext.admin])
      .rpc();

    await testContext.program.methods
      .updateDonglePriceNormal(new anchor.BN(10000000)) // 10 USDC
      .accounts({
        superAdmin: testContext.admin.publicKey,
        adminState: testContext.adminStatePda,
      })
      .signers([testContext.admin])
      .rpc();

    // Update withdraw wallet to admin's public key if different
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

  it("should withdraw specific amount successfully", async () => {
    // First, add some funds to the vault by making a purchase
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

    // Make a purchase to add funds to vault
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

    // Get vault balance before withdrawal
    const vaultBalanceBefore = await testContext.getVaultBalance();

    // Get admin's withdraw wallet token account balance before
    const adminAccountBefore = await getAccount(testContext.connection, testContext.adminUsdcAccount);
    const adminBalanceBefore = adminAccountBefore.amount;

    // Withdraw half of the vault balance
    const withdrawAmount = vaultBalanceBefore / BigInt(2);
    expect(Number(withdrawAmount)).to.be.greaterThan(0);

    const tx = await testContext.program.methods
      .withdraw(new anchor.BN(withdrawAmount.toString()))
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

    expect(tx).to.be.a("string");

    // Verify vault balance decreased
    const vaultBalanceAfter = await testContext.getVaultBalance();
    expect(vaultBalanceAfter).to.equal(vaultBalanceBefore - withdrawAmount);

    // Verify admin received the funds
    const adminAccountAfter = await getAccount(testContext.connection, testContext.adminUsdcAccount);
    const adminBalanceAfter = adminAccountAfter.amount;
    expect(adminBalanceAfter).to.equal(adminBalanceBefore + withdrawAmount);
  });

  it("should withdraw all funds successfully", async () => {
    // First, ensure there's balance in the vault
    const vaultBalanceBefore = await testContext.getVaultBalance();

    if (vaultBalanceBefore === BigInt(0)) {
      // Add some funds if vault is empty
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
        50000000 // 50 USDC
      );

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
    }

    // Get balances before withdrawal
    const vaultBalanceBeforeWithdraw = await testContext.getVaultBalance();

    const adminAccountBefore = await getAccount(testContext.connection, testContext.adminUsdcAccount);
    const adminBalanceBefore = adminAccountBefore.amount;

    expect(Number(vaultBalanceBeforeWithdraw)).to.be.greaterThan(0);

    // Withdraw all funds
    const tx = await testContext.program.methods
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

    expect(tx).to.be.a("string");

    // Verify vault is now empty
    const vaultBalanceAfter = await testContext.getVaultBalance();
    expect(Number(vaultBalanceAfter)).to.equal(0);

    // Verify admin received all the funds
    const adminAccountAfter = await getAccount(testContext.connection, testContext.adminUsdcAccount);
    const adminBalanceAfter = adminAccountAfter.amount;
    expect(adminBalanceAfter).to.equal(adminBalanceBefore + vaultBalanceBeforeWithdraw);
  });

  it("should fail to withdraw when vault has insufficient balance", async () => {
    // Try to withdraw more than vault balance
    const vaultBalance = await testContext.getVaultBalance();
    const withdrawAmount = vaultBalance + BigInt(1000000); // More than available

    try {
      await testContext.program.methods
        .withdraw(new anchor.BN(withdrawAmount.toString()))
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

      expect.fail("Expected transaction to fail with insufficient balance");
    } catch (error: any) {
      expect(error.toString()).to.include("InsufficientVaultBalance");
    }
  });

  it("should fail to withdraw all when vault is empty", async () => {
    // Ensure vault is empty
    const vaultBalance = await testContext.getVaultBalance();
    if (vaultBalance > BigInt(0)) {
      // Withdraw all first
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

    // Now try to withdraw all from empty vault
    try {
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

      expect.fail("Expected transaction to fail with empty vault");
    } catch (error: any) {
      expect(error.toString()).to.include("InsufficientVaultBalance");
    }
  });

  it("should fail with invalid withdraw amount (zero)", async () => {
    try {
      await testContext.program.methods
        .withdraw(new anchor.BN(0))
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

      expect.fail("Expected transaction to fail with invalid withdraw amount");
    } catch (error: any) {
      expect(error.toString()).to.include("InvalidWithdrawAmount");
    }
  });

  it("should fail when non-admin tries to withdraw", async () => {
    // Add some funds to vault first
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
      50000000 // 50 USDC
    );

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

    // Try to withdraw with non-admin user
    try {
      await testContext.program.methods
        .withdraw(new anchor.BN(1000000))
        .accounts({
          superAdmin: testContext.user1.keypair.publicKey, // Non-admin
          adminState: testContext.adminStatePda,
          paymentMint: testContext.usdcMint,
          vault: testContext.vaultPda,
          withdrawTokenAccount: testContext.user1.tokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([testContext.user1.keypair])
        .rpc();

      expect.fail("Expected transaction to fail with non-admin signer");
    } catch (error: any) {
      expect(error.toString()).to.include("Unauthorized");
    }
  });
});