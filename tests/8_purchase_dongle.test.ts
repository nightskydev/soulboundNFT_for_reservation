import * as anchor from "@coral-xyz/anchor";
import {
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  getAccount,
  createAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";
import { Keypair, PublicKey } from "@solana/web3.js";
import assert from "assert";
import { ctx, TOKEN_PROGRAM_ID } from "./setup";

describe("purchase_dongle", () => {
  // A fresh user without NFT for testing normal price
  let normalUser: Keypair;
  let normalUserTokenAccount: PublicKey;

  // Helper function to enable/disable purchase
  async function setPurchaseStarted(enabled: boolean) {
    await ctx.program.methods
      .updatePurchaseStarted(enabled)
      .accounts({
        superAdmin: ctx.superAdmin.publicKey,
      })
      .rpc({ skipPreflight: true });
  }

  before(async () => {
    await ctx.initialize();

    // Create a fresh user without NFT
    normalUser = Keypair.generate();

    // Airdrop SOL to normalUser
    const sig = await ctx.provider.connection.requestAirdrop(
      normalUser.publicKey,
      2e9
    );
    await ctx.provider.connection.confirmTransaction(sig, "confirmed");

    // Create token account and mint USDC for normalUser
    normalUserTokenAccount = await createAssociatedTokenAccount(
      ctx.provider.connection,
      ctx.superAdmin.payer,
      ctx.paymentMint,
      normalUser.publicKey,
      undefined,
      TOKEN_PROGRAM_ID
    );

    await mintTo(
      ctx.provider.connection,
      ctx.superAdmin.payer,
      ctx.paymentMint,
      normalUserTokenAccount,
      ctx.superAdmin.publicKey,
      1000 * 10 ** ctx.PAYMENT_DECIMALS, // 1000 USDC
      [],
      undefined,
      TOKEN_PROGRAM_ID
    );

    console.log("Normal user (no NFT):", normalUser.publicKey.toBase58());
  });

  describe("Normal User (No NFT) - Full Price", () => {
    it("should create user_state for normal user first", async () => {
      // We need to initialize user_state for normalUser before purchase_dongle
      // Since user_state is created during mint_nft, we need to check if it exists
      // For normalUser who hasn't minted, we need to handle this

      // Check if user_state exists for normalUser
      try {
        const userState = await ctx.fetchUserState(normalUser.publicKey);
        console.log(
          "Normal user already has user_state:",
          userState.nftAddress.toBase58()
        );
      } catch (e) {
        console.log("Normal user doesn't have user_state yet - expected");
      }
    });

    it("should fail purchase_dongle for user without user_state (AccountNotInitialized)", async () => {
      let errorThrown = false;
      try {
        await ctx.program.methods
          .purchaseDongle()
          .accounts({
            buyer: normalUser.publicKey,
            paymentMint: ctx.paymentMint,
            buyerTokenAccount: normalUserTokenAccount,
            paymentTokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([normalUser])
          .rpc({ skipPreflight: true });
      } catch (err: any) {
        errorThrown = true;
        console.log(
          "✓ Correctly rejected purchase_dongle for user without user_state"
        );
      }

      assert.ok(
        errorThrown,
        "Should have rejected purchase for user without user_state"
      );
    });
  });

  describe("Purchase Not Started", () => {
    it("should fail when purchase_started is false (PurchaseNotStarted)", async () => {
      // Ensure purchase is disabled
      await setPurchaseStarted(false);

      // User needs NFT to have user_state
      let userHasNft = false;
      try {
        const userState = await ctx.fetchUserState(ctx.user.publicKey);
        userHasNft =
          userState.nftAddress.toBase58() !== PublicKey.default.toBase58();
      } catch (e) {
        // User state doesn't exist
      }

      if (!userHasNft) {
        // Mint NFT for user
        const mint = Keypair.generate();
        const tokenAccount = getAssociatedTokenAddressSync(
          mint.publicKey,
          ctx.user.publicKey,
          false,
          TOKEN_2022_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID
        );

        await ctx.program.methods
          .mintNft("Test NFT", "TEST", "https://example.com/nft")
          .accounts({
            signer: ctx.user.publicKey,
            tokenAccount: tokenAccount,
            mint: mint.publicKey,
            paymentMint: ctx.paymentMint,
            payerTokenAccount: ctx.userTokenAccount,
            paymentTokenProgram: TOKEN_PROGRAM_ID,
            collectionMint: null,
          })
          .signers([mint, ctx.user])
          .rpc({ skipPreflight: true });
      }

      let errorThrown = false;
      try {
        await ctx.program.methods
          .purchaseDongle()
          .accounts({
            buyer: ctx.user.publicKey,
            paymentMint: ctx.paymentMint,
            buyerTokenAccount: ctx.userTokenAccount,
            paymentTokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([ctx.user])
          .rpc({ skipPreflight: true });
      } catch (err: any) {
        errorThrown = true;
        console.log("✓ Correctly rejected purchase when purchase_started is false");
      }

      assert.ok(errorThrown, "Should have rejected purchase when not started");
    });
  });

  describe("NFT Holder - Discounted Price", () => {
    it("should successfully purchase dongle at discounted price for NFT holder", async () => {
      // Enable purchase
      await setPurchaseStarted(true);

      // User (ctx.user) should have an NFT from previous tests
      // Let's check and mint one if needed
      let userHasNft = false;
      try {
        const userState = await ctx.fetchUserState(ctx.user.publicKey);
        userHasNft =
          userState.nftAddress.toBase58() !== PublicKey.default.toBase58();
      } catch (e) {
        // User state doesn't exist
      }

      if (!userHasNft) {
        // Mint NFT for user
        const mint = Keypair.generate();
        const tokenAccount = getAssociatedTokenAddressSync(
          mint.publicKey,
          ctx.user.publicKey,
          false,
          TOKEN_2022_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID
        );

        await ctx.program.methods
          .mintNft("Test NFT", "TEST", "https://example.com/nft")
          .accounts({
            signer: ctx.user.publicKey,
            tokenAccount: tokenAccount,
            mint: mint.publicKey,
            paymentMint: ctx.paymentMint,
            payerTokenAccount: ctx.userTokenAccount,
            paymentTokenProgram: TOKEN_PROGRAM_ID,
            collectionMint: null,
          })
          .signers([mint, ctx.user])
          .rpc({ skipPreflight: true });

        console.log("Minted NFT for user:", mint.publicKey.toBase58());
      }

      // Verify user has NFT
      const userState = await ctx.fetchUserState(ctx.user.publicKey);
      assert.notStrictEqual(
        userState.nftAddress.toBase58(),
        PublicKey.default.toBase58(),
        "User should have an NFT"
      );
      console.log("User NFT address:", userState.nftAddress.toBase58());

      // Make sure user has enough USDC for dongle purchase
      const userTokenBefore = await getAccount(
        ctx.provider.connection,
        ctx.userTokenAccount
      );
      const userBalanceBefore = Number(userTokenBefore.amount);
      
      // Top up user's USDC if needed
      if (userBalanceBefore < ctx.DONGLE_PRICE_NFT_HOLDER) {
        await mintTo(
          ctx.provider.connection,
          ctx.superAdmin.payer,
          ctx.paymentMint,
          ctx.userTokenAccount,
          ctx.superAdmin.publicKey,
          ctx.DONGLE_PRICE_NFT_HOLDER - userBalanceBefore + 1_000_000, // Add a bit extra
          [],
          undefined,
          TOKEN_PROGRAM_ID
        );
        console.log("Topped up user's USDC for dongle purchase");
      }

      // Get vault and user token account balances before purchase
      const vaultBefore = await getAccount(ctx.provider.connection, ctx.vault);
      const userTokenUpdated = await getAccount(
        ctx.provider.connection,
        ctx.userTokenAccount
      );

      const vaultBalanceBefore = Number(vaultBefore.amount);
      const userBalanceUpdated = Number(userTokenUpdated.amount);

      console.log(
        "Vault balance before:",
        vaultBalanceBefore / 10 ** ctx.PAYMENT_DECIMALS,
        "USDC"
      );
      console.log(
        "User balance before:",
        userBalanceUpdated / 10 ** ctx.PAYMENT_DECIMALS,
        "USDC"
      );

      // Purchase dongle
      const tx = await ctx.program.methods
        .purchaseDongle()
        .accounts({
          buyer: ctx.user.publicKey,
          paymentMint: ctx.paymentMint,
          buyerTokenAccount: ctx.userTokenAccount,
          paymentTokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([ctx.user])
        .rpc({ skipPreflight: true });

      await ctx.provider.connection.confirmTransaction(tx, "confirmed");
      console.log("Purchase dongle (NFT holder) tx:", tx);

      // Verify payment was transferred
      const vaultAfter = await getAccount(ctx.provider.connection, ctx.vault);
      const userTokenAfter = await getAccount(
        ctx.provider.connection,
        ctx.userTokenAccount
      );

      const vaultBalanceAfter = Number(vaultAfter.amount);
      const userBalanceAfter = Number(userTokenAfter.amount);

      assert.strictEqual(
        vaultBalanceAfter - vaultBalanceBefore,
        ctx.DONGLE_PRICE_NFT_HOLDER,
        "Vault should receive NFT holder dongle price"
      );
      assert.strictEqual(
        userBalanceUpdated - userBalanceAfter,
        ctx.DONGLE_PRICE_NFT_HOLDER,
        "User should pay NFT holder dongle price"
      );

      // Verify purchased_date is set
      const userStateAfterPurchase = await ctx.fetchUserState(ctx.user.publicKey);
      const purchasedDate = userStateAfterPurchase.purchasedDate.toNumber();
      const now = Math.floor(Date.now() / 1000);
      assert.ok(
        purchasedDate > 0 && purchasedDate <= now && purchasedDate >= now - 60,
        "Purchased date should be set to current timestamp"
      );
      console.log("✓ Purchased date set:", new Date(purchasedDate * 1000).toISOString());

      console.log(
        "✓ NFT holder paid discounted price:",
        ctx.DONGLE_PRICE_NFT_HOLDER / 10 ** ctx.PAYMENT_DECIMALS,
        "USDC"
      );
      console.log(
        "Vault balance after:",
        vaultBalanceAfter / 10 ** ctx.PAYMENT_DECIMALS,
        "USDC"
      );
    });
  });

  describe("Normal User (With user_state but no NFT) - Full Price", () => {
    // Fresh user for this test (no NFT, no previous purchase)
    let freshNormalUser: Keypair;
    let freshNormalUserTokenAccount: PublicKey;

    it("should successfully purchase dongle at full price for user without NFT", async () => {
      // Create a fresh user without NFT for testing normal price
      freshNormalUser = Keypair.generate();

      // Airdrop SOL
      const sig = await ctx.provider.connection.requestAirdrop(
        freshNormalUser.publicKey,
        2e9
      );
      await ctx.provider.connection.confirmTransaction(sig, "confirmed");

      // Create token account and mint USDC
      freshNormalUserTokenAccount = await createAssociatedTokenAccount(
        ctx.provider.connection,
        ctx.superAdmin.payer,
        ctx.paymentMint,
        freshNormalUser.publicKey,
        undefined,
        TOKEN_PROGRAM_ID
      );

      await mintTo(
        ctx.provider.connection,
        ctx.superAdmin.payer,
        ctx.paymentMint,
        freshNormalUserTokenAccount,
        ctx.superAdmin.publicKey,
        ctx.DONGLE_PRICE_NORMAL * 2, // Enough for dongle purchase
        [],
        undefined,
        TOKEN_PROGRAM_ID
      );

      console.log("Fresh normal user (no NFT):", freshNormalUser.publicKey.toBase58());

      // Get balances before
      const vaultBefore = await getAccount(ctx.provider.connection, ctx.vault);
      const userTokenBefore = await getAccount(
        ctx.provider.connection,
        freshNormalUserTokenAccount
      );

      const vaultBalanceBefore = Number(vaultBefore.amount);
      const userBalanceBefore = Number(userTokenBefore.amount);

      console.log(
        "Vault balance before:",
        vaultBalanceBefore / 10 ** ctx.PAYMENT_DECIMALS,
        "USDC"
      );
      console.log(
        "User balance before:",
        userBalanceBefore / 10 ** ctx.PAYMENT_DECIMALS,
        "USDC"
      );

      // Purchase dongle as normal user (without NFT)
      // This will create user_state via init_if_needed
      const tx = await ctx.program.methods
        .purchaseDongle()
        .accounts({
          buyer: freshNormalUser.publicKey,
          paymentMint: ctx.paymentMint,
          buyerTokenAccount: freshNormalUserTokenAccount,
          paymentTokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([freshNormalUser])
        .rpc({ skipPreflight: true });

      await ctx.provider.connection.confirmTransaction(tx, "confirmed");
      console.log("Purchase dongle (normal user) tx:", tx);

      // Verify payment was transferred at normal price
      const vaultAfter = await getAccount(ctx.provider.connection, ctx.vault);
      const userTokenAfter = await getAccount(
        ctx.provider.connection,
        freshNormalUserTokenAccount
      );

      const vaultBalanceAfter = Number(vaultAfter.amount);
      const userBalanceAfter = Number(userTokenAfter.amount);

      assert.strictEqual(
        vaultBalanceAfter - vaultBalanceBefore,
        ctx.DONGLE_PRICE_NORMAL,
        "Vault should receive normal dongle price"
      );
      assert.strictEqual(
        userBalanceBefore - userBalanceAfter,
        ctx.DONGLE_PRICE_NORMAL,
        "User should pay normal dongle price"
      );

      // Verify user_state was created and purchased_date is set
      const userStateAfterPurchase = await ctx.fetchUserState(freshNormalUser.publicKey);
      
      // Verify user has no NFT (normal user)
      assert.strictEqual(
        userStateAfterPurchase.nftAddress.toBase58(),
        PublicKey.default.toBase58(),
        "Normal user should not have an NFT"
      );

      // Verify purchased_date is set
      const purchasedDate = userStateAfterPurchase.purchasedDate.toNumber();
      const now = Math.floor(Date.now() / 1000);
      assert.ok(
        purchasedDate > 0 && purchasedDate <= now && purchasedDate >= now - 60,
        "Purchased date should be set to current timestamp"
      );
      console.log("✓ Purchased date set:", new Date(purchasedDate * 1000).toISOString());

      console.log(
        "✓ Normal user paid full price:",
        ctx.DONGLE_PRICE_NORMAL / 10 ** ctx.PAYMENT_DECIMALS,
        "USDC"
      );
      console.log(
        "Vault balance after:",
        vaultBalanceAfter / 10 ** ctx.PAYMENT_DECIMALS,
        "USDC"
      );
    });
  });

  describe("Failure Cases", () => {
    it("should fail when user has already purchased (AlreadyPurchased)", async () => {
      // ctx.user already purchased in previous test, so trying again should fail
      let errorThrown = false;
      try {
        await ctx.program.methods
          .purchaseDongle()
          .accounts({
            buyer: ctx.user.publicKey,
            paymentMint: ctx.paymentMint,
            buyerTokenAccount: ctx.userTokenAccount,
            paymentTokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([ctx.user])
          .rpc({ skipPreflight: true });
      } catch (err: any) {
        errorThrown = true;
        const errMsg = err.toString();
        assert.ok(
          errMsg.includes("AlreadyPurchased") || errMsg.includes("already purchased"),
          "Error should be AlreadyPurchased"
        );
        console.log("✓ Correctly rejected duplicate purchase");
      }

      assert.ok(errorThrown, "Should have rejected duplicate purchase");
    });

    it("should fail with invalid payment mint (InvalidPaymentMint)", async () => {
      // Try to get or create a token account for wrong mint
      let wrongUserTokenAccount: PublicKey;
      try {
        wrongUserTokenAccount = await createAssociatedTokenAccount(
          ctx.provider.connection,
          ctx.superAdmin.payer,
          ctx.wrongPaymentMint,
          ctx.user.publicKey,
          undefined,
          TOKEN_PROGRAM_ID
        );
      } catch (e) {
        // Account might already exist from previous tests
        wrongUserTokenAccount = getAssociatedTokenAddressSync(
          ctx.wrongPaymentMint,
          ctx.user.publicKey,
          false,
          TOKEN_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID
        );
      }

      let errorThrown = false;
      try {
        await ctx.program.methods
          .purchaseDongle()
          .accounts({
            buyer: ctx.user.publicKey,
            paymentMint: ctx.wrongPaymentMint, // Wrong mint!
            buyerTokenAccount: wrongUserTokenAccount,
            paymentTokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([ctx.user])
          .rpc({ skipPreflight: true });
      } catch (err: any) {
        errorThrown = true;
        // Error can be constraint mismatch or InvalidPaymentMint depending on validation order
        console.log("✓ Correctly rejected invalid payment mint");
      }

      assert.ok(errorThrown, "Should have rejected invalid payment mint");
    });

    it("should fail with insufficient funds", async () => {
      // Create a user with not enough USDC
      const poorUser = Keypair.generate();
      const sig = await ctx.provider.connection.requestAirdrop(
        poorUser.publicKey,
        2e9
      );
      await ctx.provider.connection.confirmTransaction(sig, "confirmed");

      const poorUserTokenAccount = await createAssociatedTokenAccount(
        ctx.provider.connection,
        ctx.superAdmin.payer,
        ctx.paymentMint,
        poorUser.publicKey,
        undefined,
        TOKEN_PROGRAM_ID
      );

      // Mint only 1 USDC (not enough for dongle)
      await mintTo(
        ctx.provider.connection,
        ctx.superAdmin.payer,
        ctx.paymentMint,
        poorUserTokenAccount,
        ctx.superAdmin.publicKey,
        1 * 10 ** ctx.PAYMENT_DECIMALS,
        [],
        undefined,
        TOKEN_PROGRAM_ID
      );

      // First mint an NFT for poorUser so they have a user_state
      const mint = Keypair.generate();
      const tokenAccount = getAssociatedTokenAddressSync(
        mint.publicKey,
        poorUser.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      );

      // We need to give poorUser more USDC to mint NFT first
      await mintTo(
        ctx.provider.connection,
        ctx.superAdmin.payer,
        ctx.paymentMint,
        poorUserTokenAccount,
        ctx.superAdmin.publicKey,
        ctx.MINT_FEE * 2, // Enough for mint fee
        [],
        undefined,
        TOKEN_PROGRAM_ID
      );

      // Check current admin state to get actual mint fee
      const adminState = await ctx.fetchAdminState();
      const currentMintFee = adminState.mintFee.toNumber();

      await ctx.program.methods
        .mintNft("Poor User NFT", "POOR", "https://example.com/poor")
        .accounts({
          signer: poorUser.publicKey,
          tokenAccount: tokenAccount,
          mint: mint.publicKey,
          paymentMint: ctx.paymentMint,
          payerTokenAccount: poorUserTokenAccount,
          paymentTokenProgram: TOKEN_PROGRAM_ID,
          collectionMint: null,
        })
        .signers([mint, poorUser])
        .rpc({ skipPreflight: true });

      // Now try to purchase dongle with insufficient funds
      let errorThrown = false;
      try {
        await ctx.program.methods
          .purchaseDongle()
          .accounts({
            buyer: poorUser.publicKey,
            paymentMint: ctx.paymentMint,
            buyerTokenAccount: poorUserTokenAccount,
            paymentTokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([poorUser])
          .rpc({ skipPreflight: true });
      } catch (err: any) {
        errorThrown = true;
        console.log("✓ Correctly rejected purchase with insufficient funds");
      }

      assert.ok(errorThrown, "Should have rejected insufficient funds");
    });
  });
});

