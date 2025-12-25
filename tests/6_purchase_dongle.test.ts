import * as anchor from "@coral-xyz/anchor";
import { expect } from "chai";
import { testContext, initializeTestContext, MINT_FEE, MAX_SUPPLY, MINT_START_DATE, DONGLE_PRICE_NFT_HOLDER, DONGLE_PRICE_NORMAL } from "./setup";
import { Keypair, PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress, getAccount, createAssociatedTokenAccount, createMint, mintTo } from "@solana/spl-token";

describe("purchase_dongle", () => {
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

    // Enable purchase started
    await testContext.program.methods
      .updatePurchaseStarted(true)
      .accounts({
        superAdmin: testContext.admin.publicKey,
        adminState: testContext.adminStatePda,
      })
      .signers([testContext.admin])
      .rpc();

    // Set reasonable dongle prices for testing
    await testContext.program.methods
      .updateDonglePriceNftHolder(new anchor.BN(10000000)) // 10 USDC
      .accounts({
        superAdmin: testContext.admin.publicKey,
        adminState: testContext.adminStatePda,
      })
      .signers([testContext.admin])
      .rpc();

    await testContext.program.methods
      .updateDonglePriceNormal(new anchor.BN(50000000)) // 50 USDC
      .accounts({
        superAdmin: testContext.admin.publicKey,
        adminState: testContext.adminStatePda,
      })
      .signers([testContext.admin])
      .rpc();
  });

  it("should allow non-NFT holder to purchase dongle at normal price", async () => {
    // Create a new user for this test
    const newUser = Keypair.generate();
    await testContext.connection.confirmTransaction(
      await testContext.connection.requestAirdrop(newUser.publicKey, 5 * anchor.web3.LAMPORTS_PER_SOL)
    );

    // Create and fund USDC account
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

    // Get vault balance before purchase
    const vaultBalanceBefore = await testContext.getVaultBalance();

    // Purchase dongle
    const [userStatePda] = testContext.getUserStatePda(newUser.publicKey);
    const tx = await testContext.program.methods
      .purchaseDongle()
      .accounts({
        buyer: newUser.publicKey,
        adminState: testContext.adminStatePda,
        userState: userStatePda,
        paymentMint: testContext.usdcMint,
        buyerTokenAccount: newUserUsdcAccount,
        vault: testContext.vaultPda,
        paymentTokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([newUser])
      .rpc();

    expect(tx).to.be.a("string");

    // Verify user state was updated
    const userStateAfter = await testContext.fetchUserState(newUser.publicKey);
    expect(userStateAfter.purchasedDate.toNumber()).to.be.greaterThan(0);

    // Verify payment was transferred to vault
    const vaultBalanceAfter = await testContext.getVaultBalance();
    const adminState = await testContext.fetchAdminState();
    const expectedPrice = BigInt(adminState.donglePriceNormal.toString());
    expect(vaultBalanceAfter).to.equal(vaultBalanceBefore + expectedPrice);
  });

  it("should fail when purchase is not started", async () => {
    // Disable purchase started
    await testContext.program.methods
      .updatePurchaseStarted(false)
      .accounts({
        superAdmin: testContext.admin.publicKey,
        adminState: testContext.adminStatePda,
      })
      .signers([testContext.admin])
      .rpc();

    const newUser = Keypair.generate();
    await testContext.connection.confirmTransaction(
      await testContext.connection.requestAirdrop(newUser.publicKey, 5 * anchor.web3.LAMPORTS_PER_SOL)
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

    const [userStatePda] = testContext.getUserStatePda(newUser.publicKey);

    try {
      await testContext.program.methods
        .purchaseDongle()
        .accounts({
          buyer: newUser.publicKey,
          adminState: testContext.adminStatePda,
          userState: userStatePda,
          paymentMint: testContext.usdcMint,
          buyerTokenAccount: newUserUsdcAccount,
          vault: testContext.vaultPda,
          paymentTokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([newUser])
        .rpc();

      expect.fail("Expected transaction to fail when purchase is not started");
    } catch (error: any) {
      expect(error.toString()).to.include("PurchaseNotStarted");
    }

    // Re-enable purchase for other tests
    await testContext.program.methods
      .updatePurchaseStarted(true)
      .accounts({
        superAdmin: testContext.admin.publicKey,
        adminState: testContext.adminStatePda,
      })
      .signers([testContext.admin])
      .rpc();
  });

  it("should fail with invalid payment mint", async () => {
    const newUser = Keypair.generate();
    await testContext.connection.confirmTransaction(
      await testContext.connection.requestAirdrop(newUser.publicKey, 5 * anchor.web3.LAMPORTS_PER_SOL)
    );

    // Create a different token mint
    const differentMint = await createMint(
      testContext.connection,
      testContext.admin,
      testContext.admin.publicKey,
      testContext.admin.publicKey,
      6
    );

    const newUserTokenAccount = await createAssociatedTokenAccount(
      testContext.connection,
      testContext.admin,
      differentMint,
      newUser.publicKey
    );

    await mintTo(
      testContext.connection,
      testContext.admin,
      differentMint,
      newUserTokenAccount,
      testContext.admin,
      100000000
    );

    const [userStatePda] = testContext.getUserStatePda(newUser.publicKey);

    // Try with the wrong payment mint but correct vault (should fail constraint check)
    try {
      await testContext.program.methods
        .purchaseDongle()
        .accounts({
          buyer: newUser.publicKey,
          adminState: testContext.adminStatePda,
          userState: userStatePda,
          paymentMint: differentMint, // Wrong mint - constraint will fail
          buyerTokenAccount: newUserTokenAccount,
          vault: testContext.vaultPda, // Use actual vault
          paymentTokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([newUser])
        .rpc();

      expect.fail("Expected transaction to fail with invalid payment mint");
    } catch (error: any) {
      // The constraint check will fail because payment_mint doesn't match admin_state.payment_mint
      expect(error.toString()).to.include("InvalidPaymentMint");
    }
  });

  it("should create user state if it doesn't exist", async () => {
    const newUser = Keypair.generate();
    await testContext.connection.confirmTransaction(
      await testContext.connection.requestAirdrop(newUser.publicKey, 5 * anchor.web3.LAMPORTS_PER_SOL)
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

    const [userStatePda] = testContext.getUserStatePda(newUser.publicKey);

    // Purchase should create user state
    const tx = await testContext.program.methods
      .purchaseDongle()
      .accounts({
        buyer: newUser.publicKey,
        adminState: testContext.adminStatePda,
        userState: userStatePda,
        paymentMint: testContext.usdcMint,
        buyerTokenAccount: newUserUsdcAccount,
        vault: testContext.vaultPda,
        paymentTokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([newUser])
      .rpc();

    expect(tx).to.be.a("string");

    // Verify user state was created
    const userState = await testContext.fetchUserState(newUser.publicKey);
    expect(userState.purchasedDate.toNumber()).to.be.greaterThan(0);
    expect(userState.nftAddress.toString()).to.equal(PublicKey.default.toString());
  });
});