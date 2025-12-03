import * as anchor from "@coral-xyz/anchor";
import {
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  getAccount,
  createAssociatedTokenAccount,
} from "@solana/spl-token";
import { Keypair } from "@solana/web3.js";
import assert from "assert";
import { ctx, TOKEN_PROGRAM_ID } from "./setup";

describe("mint_nft", () => {
  before(async () => {
    await ctx.initialize();
  });

  describe("Failure Cases (Pre-mint)", () => {
    it("should fail to mint before start date (MintNotStarted)", async () => {
      // Set mint_start_date to 1 hour in the future
      const futureTimestamp = Math.floor(Date.now() / 1000) + 3600;

      await ctx.program.methods
        .updateAdminInfo(
          new anchor.BN(ctx.MINT_FEE * 2),
          new anchor.BN(ctx.MAX_SUPPLY),
          new anchor.BN(futureTimestamp),
          new anchor.BN(ctx.DONGLE_PRICE_NFT_HOLDER),
          new anchor.BN(ctx.DONGLE_PRICE_NORMAL)
        )
        .accounts({
          superAdmin: ctx.superAdmin.publicKey,
          newSuperAdmin: ctx.superAdmin.publicKey,
        })
        .rpc({ skipPreflight: true });

      console.log(
        "Set future mint_start_date:",
        new Date(futureTimestamp * 1000).toISOString()
      );

      const mint = Keypair.generate();
      const tokenAccount = getAssociatedTokenAddressSync(
        mint.publicKey,
        ctx.user.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      );

      let errorThrown = false;
      try {
        await ctx.program.methods
          .mintNft("Test NFT", "TEST", "https://example.com/nft")
          .accounts({
            signer: ctx.user.publicKey,
            tokenAccount: tokenAccount,
            mint: mint.publicKey,
            paymentMint: ctx.paymentMint,
            payerTokenAccount: ctx.userTokenAccount,
            paymentTokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([mint, ctx.user])
          .rpc({ skipPreflight: true });
      } catch (err: any) {
        errorThrown = true;
        console.log("✓ Correctly rejected mint before start date");
      } finally {
        // ALWAYS reset mint_start_date to 0 for subsequent tests
        await ctx.program.methods
          .updateAdminInfo(
            new anchor.BN(ctx.MINT_FEE * 2),
            new anchor.BN(ctx.MAX_SUPPLY),
            new anchor.BN(0),
            new anchor.BN(ctx.DONGLE_PRICE_NFT_HOLDER),
            new anchor.BN(ctx.DONGLE_PRICE_NORMAL)
          )
          .accounts({
            superAdmin: ctx.superAdmin.publicKey,
            newSuperAdmin: ctx.superAdmin.publicKey,
          })
          .rpc({ skipPreflight: true });
      }

      assert.ok(errorThrown, "Should have rejected mint before start date");
    });

    it("should fail with invalid payment mint (InvalidPaymentMint)", async () => {
      // Create a token account for wrong mint
      const wrongUserTokenAccount = await createAssociatedTokenAccount(
        ctx.provider.connection,
        ctx.superAdmin.payer,
        ctx.wrongPaymentMint,
        ctx.user.publicKey,
        undefined,
        TOKEN_PROGRAM_ID
      );

      const mint = Keypair.generate();
      const tokenAccount = getAssociatedTokenAddressSync(
        mint.publicKey,
        ctx.user.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      );

      let errorThrown = false;
      try {
        await ctx.program.methods
          .mintNft("Test NFT", "TEST", "https://example.com/nft")
          .accounts({
            signer: ctx.user.publicKey,
            tokenAccount: tokenAccount,
            mint: mint.publicKey,
            paymentMint: ctx.wrongPaymentMint, // Wrong mint!
            payerTokenAccount: wrongUserTokenAccount,
            paymentTokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([mint, ctx.user])
          .rpc({ skipPreflight: true });
      } catch (err: any) {
        errorThrown = true;
        console.log("✓ Correctly rejected invalid payment mint");
      }

      assert.ok(errorThrown, "Should have rejected invalid payment mint");
    });
  });

  describe("Success Cases", () => {
    it("should successfully mint NFT", async () => {
      const mint = Keypair.generate();
      const tokenAccount = getAssociatedTokenAddressSync(
        mint.publicKey,
        ctx.user.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      );

      const vaultBefore = await getAccount(ctx.provider.connection, ctx.vault);
      const vaultBalanceBefore = Number(vaultBefore.amount);

      const tx = await ctx.program.methods
        .mintNft("Test NFT", "TEST", "https://example.com/nft")
        .accounts({
          signer: ctx.user.publicKey,
          tokenAccount: tokenAccount,
          mint: mint.publicKey,
          paymentMint: ctx.paymentMint,
          payerTokenAccount: ctx.userTokenAccount,
          paymentTokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([mint, ctx.user])
        .rpc({ skipPreflight: true });

      await ctx.provider.connection.confirmTransaction(tx, "confirmed");
      console.log("Mint NFT tx:", tx);

      // Store minted NFT info for burn tests
      ctx.mintedNftMint = mint.publicKey;
      ctx.mintedNftTokenAccount = tokenAccount;

      // Verify vault received payment
      const vaultAfter = await getAccount(ctx.provider.connection, ctx.vault);
      const vaultBalanceAfter = Number(vaultAfter.amount);
      const expectedFee = ctx.MINT_FEE * 2; // Doubled in update_admin test

      assert.strictEqual(
        vaultBalanceAfter - vaultBalanceBefore,
        expectedFee,
        "Vault should receive mint fee"
      );
      console.log(
        "Vault balance after mint:",
        vaultBalanceAfter / 10 ** ctx.PAYMENT_DECIMALS,
        "USDC"
      );

      // Verify admin state updated
      const state = await ctx.fetchAdminState();
      assert.strictEqual(
        state.currentReservedCount.toNumber(),
        1,
        "Reserved count should be 1"
      );
      console.log(
        "Current reserved count:",
        state.currentReservedCount.toString()
      );

      // Verify user state updated
      const userState = await ctx.fetchUserState(ctx.user.publicKey);
      assert.strictEqual(
        userState.nftAddress.toBase58(),
        mint.publicKey.toBase58(),
        "User state should store NFT address"
      );
      console.log("User NFT address:", userState.nftAddress.toBase58());
    });
  });

  describe("Failure Cases (Post-mint)", () => {
    it("should fail when user already has NFT (UserAlreadyHasNft)", async () => {
      const mint = Keypair.generate();
      const tokenAccount = getAssociatedTokenAddressSync(
        mint.publicKey,
        ctx.user.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      );

      let errorThrown = false;
      try {
        await ctx.program.methods
          .mintNft("Test NFT 2", "TEST2", "https://example.com/nft2")
          .accounts({
            signer: ctx.user.publicKey,
            tokenAccount: tokenAccount,
            mint: mint.publicKey,
            paymentMint: ctx.paymentMint,
            payerTokenAccount: ctx.userTokenAccount,
            paymentTokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([mint, ctx.user])
          .rpc({ skipPreflight: true });
      } catch (err: any) {
        errorThrown = true;
        console.log("✓ Correctly rejected duplicate mint for same user");
      }

      assert.ok(errorThrown, "Should have rejected duplicate mint");
    });

    it("should fail when max supply is reached (MaxSupplyReached)", async () => {
      // Set max supply to current count (1)
      await ctx.program.methods
        .updateAdminInfo(
          new anchor.BN(ctx.MINT_FEE * 2),
          new anchor.BN(1), // Set max supply to 1 (already minted 1)
          new anchor.BN(0),
          new anchor.BN(ctx.DONGLE_PRICE_NFT_HOLDER),
          new anchor.BN(ctx.DONGLE_PRICE_NORMAL)
        )
        .accounts({
          superAdmin: ctx.superAdmin.publicKey,
          newSuperAdmin: ctx.superAdmin.publicKey,
        })
        .rpc({ skipPreflight: true });

      const mint = Keypair.generate();
      const tokenAccount = getAssociatedTokenAddressSync(
        mint.publicKey,
        ctx.user2.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      );

      let errorThrown = false;
      try {
        await ctx.program.methods
          .mintNft("Test NFT", "TEST", "https://example.com/nft")
          .accounts({
            signer: ctx.user2.publicKey,
            tokenAccount: tokenAccount,
            mint: mint.publicKey,
            paymentMint: ctx.paymentMint,
            payerTokenAccount: ctx.user2TokenAccount,
            paymentTokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([mint, ctx.user2])
          .rpc({ skipPreflight: true });
      } catch (err: any) {
        errorThrown = true;
        console.log("✓ Correctly rejected mint when max supply reached");
      } finally {
        // ALWAYS restore max supply, even if assertion fails
        await ctx.program.methods
          .updateAdminInfo(
            new anchor.BN(ctx.MINT_FEE * 2),
            new anchor.BN(ctx.MAX_SUPPLY),
            new anchor.BN(0),
            new anchor.BN(ctx.DONGLE_PRICE_NFT_HOLDER),
            new anchor.BN(ctx.DONGLE_PRICE_NORMAL)
          )
          .accounts({
            superAdmin: ctx.superAdmin.publicKey,
            newSuperAdmin: ctx.superAdmin.publicKey,
          })
          .rpc({ skipPreflight: true });
      }

      assert.ok(errorThrown, "Should have rejected mint at max supply");
    });

    it("should allow minting for different user (user2)", async () => {
      const mint = Keypair.generate();
      const tokenAccount = getAssociatedTokenAddressSync(
        mint.publicKey,
        ctx.user2.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      );

      const tx = await ctx.program.methods
        .mintNft("User2 NFT", "U2NFT", "https://example.com/user2nft")
        .accounts({
          signer: ctx.user2.publicKey,
          tokenAccount: tokenAccount,
          mint: mint.publicKey,
          paymentMint: ctx.paymentMint,
          payerTokenAccount: ctx.user2TokenAccount,
          paymentTokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([mint, ctx.user2])
        .rpc({ skipPreflight: true });

      await ctx.provider.connection.confirmTransaction(tx, "confirmed");
      console.log("✓ User2 minted NFT successfully");

      const state = await ctx.fetchAdminState();
      assert.strictEqual(
        state.currentReservedCount.toNumber(),
        2,
        "Reserved count should be 2"
      );
    });
  });
});
