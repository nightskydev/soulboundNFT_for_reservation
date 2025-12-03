import * as anchor from "@coral-xyz/anchor";
import {
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { Keypair, PublicKey } from "@solana/web3.js";
import assert from "assert";
import { ctx, TOKEN_PROGRAM_ID } from "./setup";

describe("burn_nft", () => {
  let userMintedNft: PublicKey;
  let userNftTokenAccount: PublicKey;

  before(async () => {
    await ctx.initialize();

    // Check if user has an NFT
    try {
      const userState = await ctx.fetchUserState(ctx.user.publicKey);
      if (userState.nftAddress.toBase58() !== PublicKey.default.toBase58()) {
        userMintedNft = userState.nftAddress;
        userNftTokenAccount = getAssociatedTokenAddressSync(
          userState.nftAddress,
          ctx.user.publicKey,
          false,
          TOKEN_2022_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID
        );
        console.log("User NFT mint:", userMintedNft.toBase58());
        console.log("User NFT token account:", userNftTokenAccount.toBase58());
        return;
      }
    } catch (e) {
      // User state doesn't exist yet
    }

    // User doesn't have an NFT, mint one
    const mint = Keypair.generate();
    const tokenAccount = getAssociatedTokenAddressSync(
      mint.publicKey,
      ctx.user.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );

    await ctx.program.methods
      .mintNft("Burn Test NFT", "BURN", "https://example.com/burn")
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

    userMintedNft = mint.publicKey;
    userNftTokenAccount = tokenAccount;

    console.log("User NFT mint:", userMintedNft.toBase58());
    console.log("User NFT token account:", userNftTokenAccount.toBase58());
  });

  describe("Failure Cases", () => {
    it("should fail when user doesn't own the NFT (UserDoesNotOwnNft)", async () => {
      // User2 tries to burn User's NFT
      let errorThrown = false;
      try {
        await ctx.program.methods
          .burnNft()
          .accounts({
            signer: ctx.user2.publicKey,
            oldTokenAccount: userNftTokenAccount,
            oldMint: userMintedNft,
          })
          .signers([ctx.user2])
          .rpc({ skipPreflight: true });
      } catch (err: any) {
        errorThrown = true;
        console.log("✓ Correctly rejected burn by non-owner");
      }

      assert.ok(errorThrown, "Should have rejected burn by non-owner");
    });

    it("should fail with wrong mint address (UserDoesNotOwnNft)", async () => {
      // Try to burn with a random mint address
      const wrongMint = Keypair.generate();

      let errorThrown = false;
      try {
        await ctx.program.methods
          .burnNft()
          .accounts({
            signer: ctx.user.publicKey,
            oldTokenAccount: userNftTokenAccount,
            oldMint: wrongMint.publicKey, // Wrong mint!
          })
          .signers([ctx.user])
          .rpc({ skipPreflight: true });
      } catch (err: any) {
        errorThrown = true;
        console.log("✓ Correctly rejected burn with wrong mint");
      }

      assert.ok(errorThrown, "Should have rejected burn with wrong mint");
    });

    it("should fail with wrong token account (InvalidTokenAccount)", async () => {
      // Create a different token account
      const wrongTokenAccount = Keypair.generate();

      let errorThrown = false;
      try {
        await ctx.program.methods
          .burnNft()
          .accounts({
            signer: ctx.user.publicKey,
            oldTokenAccount: wrongTokenAccount.publicKey, // Wrong token account!
            oldMint: userMintedNft,
          })
          .signers([ctx.user])
          .rpc({ skipPreflight: true });
      } catch (err: any) {
        errorThrown = true;
        console.log("✓ Correctly rejected burn with wrong token account");
      }

      assert.ok(errorThrown, "Should have rejected burn with wrong token account");
    });
  });

  describe("Success Cases", () => {
    it("should successfully burn user's NFT", async () => {
      const stateBefore = await ctx.fetchAdminState();
      const reservedCountBefore = stateBefore.currentReservedCount.toNumber();

      const tx = await ctx.program.methods
        .burnNft()
        .accounts({
          signer: ctx.user.publicKey,
          oldTokenAccount: userNftTokenAccount,
          oldMint: userMintedNft,
        })
        .signers([ctx.user])
        .rpc({ skipPreflight: true });

      await ctx.provider.connection.confirmTransaction(tx, "confirmed");
      console.log("Burn NFT tx:", tx);

      // Verify user state is cleared
      const userState = await ctx.fetchUserState(ctx.user.publicKey);
      assert.strictEqual(
        userState.nftAddress.toBase58(),
        PublicKey.default.toBase58(),
        "User NFT address should be cleared"
      );

      // Verify reserved count decreased
      const stateAfter = await ctx.fetchAdminState();
      assert.strictEqual(
        stateAfter.currentReservedCount.toNumber(),
        reservedCountBefore - 1,
        "Reserved count should decrease by 1"
      );

      console.log("✓ NFT burned successfully");
      console.log("  Reserved count:", stateAfter.currentReservedCount.toString());
    });

    it("should fail to burn after NFT is already burned (UserDoesNotOwnNft)", async () => {
      // Try to burn again - user no longer has NFT
      let errorThrown = false;
      try {
        await ctx.program.methods
          .burnNft()
          .accounts({
            signer: ctx.user.publicKey,
            oldTokenAccount: userNftTokenAccount,
            oldMint: userMintedNft,
          })
          .signers([ctx.user])
          .rpc({ skipPreflight: true });
      } catch (err: any) {
        errorThrown = true;
        console.log("✓ Correctly rejected burn of already burned NFT");
      }

      assert.ok(errorThrown, "Should have rejected burn of already burned NFT");
    });

    it("should allow user to mint again after burning", async () => {
      const mint = Keypair.generate();
      const tokenAccount = getAssociatedTokenAddressSync(
        mint.publicKey,
        ctx.user.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      );

      const tx = await ctx.program.methods
        .mintNft("New NFT After Burn", "NEWBURN", "https://example.com/newburn")
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
      console.log("Re-mint after burn tx:", tx);

      // Verify user has new NFT
      const userState = await ctx.fetchUserState(ctx.user.publicKey);
      assert.strictEqual(
        userState.nftAddress.toBase58(),
        mint.publicKey.toBase58(),
        "User should have new NFT"
      );

      console.log("✓ Successfully minted new NFT after burning previous one");
    });
  });
});
