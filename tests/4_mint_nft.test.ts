import * as anchor from "@coral-xyz/anchor";
import {
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  getAccount,
  createAssociatedTokenAccount,
} from "@solana/spl-token";
import { Keypair, PublicKey } from "@solana/web3.js";
import assert from "assert";
import { ctx, TOKEN_PROGRAM_ID } from "./setup";

describe("NFT Collection and Minting", () => {
  before(async () => {
    await ctx.initialize();
  });

  describe("Collection Creation", () => {
    it("should successfully create OG collection NFT", async () => {
      const ogCollectionMint = Keypair.generate();

      // Derive collection state PDA
      const [ogCollectionState] = PublicKey.findProgramAddressSync(
        [Buffer.from("collection"), ogCollectionMint.publicKey.toBuffer()],
        ctx.program.programId
      );

      const tx = await ctx.program.methods
        .createCollectionNft("OG Collection", "OG", "https://example.com/og-collection")
        .accounts({
          signer: ctx.superAdmin.publicKey,
          collectionMint: ogCollectionMint.publicKey,
          collectionState: ogCollectionState,
          systemProgram: ctx.provider.connection.systemProgram,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          adminState: ctx.adminState,
        })
        .signers([ogCollectionMint, ctx.superAdmin.payer])
        .rpc({ skipPreflight: true });

      await ctx.provider.connection.confirmTransaction(tx, "confirmed");
      console.log("Create OG collection tx:", tx);

      // Set OG collection in admin state
      await ctx.program.methods
        .updateOgCollection(ogCollectionMint.publicKey)
        .accounts({
          superAdmin: ctx.superAdmin.publicKey,
        })
        .rpc({ skipPreflight: true });

      // Store OG collection info for later tests
      ctx.ogCollectionMint = ogCollectionMint.publicKey;

      // Verify collection state
      const collectionStateData = await ctx.program.account.collectionState.fetch(ogCollectionState);
      assert.strictEqual(collectionStateData.name, "OG Collection");
      assert.strictEqual(collectionStateData.symbol, "OG");
      assert.strictEqual(collectionStateData.uri, "https://example.com/og-collection");
      assert.strictEqual(collectionStateData.collectionMint.toBase58(), ogCollectionMint.publicKey.toBase58());
      assert.ok(collectionStateData.isVerified);
      console.log("✓ OG Collection created successfully");
    });

    it("should successfully create Dongle Proof collection NFT", async () => {
      const dongleProofCollectionMint = Keypair.generate();

      // Derive collection state PDA
      const [dongleProofCollectionState] = PublicKey.findProgramAddressSync(
        [Buffer.from("collection"), dongleProofCollectionMint.publicKey.toBuffer()],
        ctx.program.programId
      );

      const tx = await ctx.program.methods
        .createCollectionNft("Dongle Proof Collection", "DONGLE", "https://example.com/dongle-collection")
        .accounts({
          signer: ctx.superAdmin.publicKey,
          collectionMint: dongleProofCollectionMint.publicKey,
          collectionState: dongleProofCollectionState,
          systemProgram: ctx.provider.connection.systemProgram,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          adminState: ctx.adminState,
        })
        .signers([dongleProofCollectionMint, ctx.superAdmin.payer])
        .rpc({ skipPreflight: true });

      await ctx.provider.connection.confirmTransaction(tx, "confirmed");
      console.log("Create Dongle Proof collection tx:", tx);

      // Set Dongle Proof collection in admin state
      await ctx.program.methods
        .updateDongleProofCollection(dongleProofCollectionMint.publicKey)
        .accounts({
          superAdmin: ctx.superAdmin.publicKey,
        })
        .rpc({ skipPreflight: true });

      // Store Dongle Proof collection info for later tests
      ctx.dongleProofCollectionMint = dongleProofCollectionMint.publicKey;

      // Verify collection state
      const collectionStateData = await ctx.program.account.collectionState.fetch(dongleProofCollectionState);
      assert.strictEqual(collectionStateData.name, "Dongle Proof Collection");
      assert.strictEqual(collectionStateData.symbol, "DONGLE");
      assert.strictEqual(collectionStateData.uri, "https://example.com/dongle-collection");
      assert.strictEqual(collectionStateData.collectionMint.toBase58(), dongleProofCollectionMint.publicKey.toBase58());
      assert.ok(collectionStateData.isVerified);
      console.log("✓ Dongle Proof Collection created successfully");
    });
  });

  describe("Failure Cases (Pre-mint)", () => {
    it("should fail to mint before start date (MintNotStarted)", async () => {
      // Set mint_start_date to 1 hour in the future
      const futureTimestamp = Math.floor(Date.now() / 1000) + 3600;

      await ctx.program.methods
        .updateMintStartDate(new anchor.BN(futureTimestamp))
        .accounts({
          superAdmin: ctx.superAdmin.publicKey,
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
            collectionMint: null, // No collection
          })
          .signers([mint, ctx.user])
          .rpc({ skipPreflight: true });
      } catch (err: any) {
        errorThrown = true;
        console.log("✓ Correctly rejected mint before start date");
      } finally {
        // ALWAYS reset mint_start_date to 0 for subsequent tests
        await ctx.program.methods
          .updateMintStartDate(new anchor.BN(0))
          .accounts({
            superAdmin: ctx.superAdmin.publicKey,
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
            collectionMint: null, // No collection
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
          collectionMint: null, // No collection for standalone NFT
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

      // Verify NFT mint date is set
      const mintDate = userState.nftMintDate.toNumber();
      const now = Math.floor(Date.now() / 1000);
      assert.ok(
        mintDate > 0 && mintDate <= now + 60, // within 60 seconds tolerance
        "NFT mint date should be set to a recent timestamp"
      );
      console.log("NFT mint date:", new Date(mintDate * 1000).toISOString());
    });

    it("should successfully mint NFT with collection", async () => {
      const mint = Keypair.generate();
      const tokenAccount = getAssociatedTokenAddressSync(
        mint.publicKey,
        ctx.user3.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      );

      // Use the collection created earlier
      const vaultBefore = await getAccount(ctx.provider.connection, ctx.vault);
      const vaultBalanceBefore = Number(vaultBefore.amount);

      const tx = await ctx.program.methods
        .mintNft("Collection NFT #1", "CNFT", "https://example.com/collection-nft-1")
        .accounts({
          signer: ctx.user3.publicKey,
          tokenAccount: tokenAccount,
          mint: mint.publicKey,
          paymentMint: ctx.paymentMint,
          payerTokenAccount: ctx.user3TokenAccount,
          paymentTokenProgram: TOKEN_PROGRAM_ID,
          collectionMint: ctx.ogCollectionMint, // Use the OG collection
        })
        .signers([mint, ctx.user3])
        .rpc({ skipPreflight: true });

      await ctx.provider.connection.confirmTransaction(tx, "confirmed");
      console.log("Mint collection NFT tx:", tx);

      // Store minted NFT info for burn tests
      ctx.collectionNftMint = mint.publicKey;
      ctx.collectionNftTokenAccount = tokenAccount;

      // Verify vault received payment
      const vaultAfter = await getAccount(ctx.provider.connection, ctx.vault);
      const vaultBalanceAfter = Number(vaultAfter.amount);
      const expectedFee = ctx.MINT_FEE * 2; // Doubled in update_admin test

      assert.strictEqual(
        vaultBalanceAfter - vaultBalanceBefore,
        expectedFee,
        "Vault should receive mint fee for collection NFT"
      );

      // Verify admin state updated (should be 2 now - 1 standalone + 1 collection NFT)
      const state = await ctx.fetchAdminState();
      assert.strictEqual(
        state.currentReservedCount.toNumber(),
        2,
        "Reserved count should be 2"
      );

      // Verify user3 state updated
      const userState = await ctx.fetchUserState(ctx.user3.publicKey);
      assert.strictEqual(
        userState.nftAddress.toBase58(),
        mint.publicKey.toBase58(),
        "User3 state should store collection NFT address"
      );

      console.log("✓ Collection NFT minted successfully");
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
            collectionMint: null, // No collection
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
      // Set max supply to current count (2 - 1 standalone + 1 collection)
      await ctx.program.methods
        .updateMaxSupply(new anchor.BN(2)) // Set max supply to 2 (already minted 2)
        .accounts({
          superAdmin: ctx.superAdmin.publicKey,
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
            collectionMint: null, // No collection
          })
          .signers([mint, ctx.user2])
          .rpc({ skipPreflight: true });
      } catch (err: any) {
        errorThrown = true;
        console.log("✓ Correctly rejected mint when max supply reached");
      } finally {
        // ALWAYS restore max supply, even if assertion fails
        await ctx.program.methods
          .updateMaxSupply(new anchor.BN(ctx.MAX_SUPPLY))
          .accounts({
            superAdmin: ctx.superAdmin.publicKey,
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
          collectionMint: null, // No collection
        })
        .signers([mint, ctx.user2])
        .rpc({ skipPreflight: true });

      await ctx.provider.connection.confirmTransaction(tx, "confirmed");
      console.log("✓ User2 minted NFT successfully");

      const state = await ctx.fetchAdminState();
      assert.strictEqual(
        state.currentReservedCount.toNumber(),
        3,
        "Reserved count should be 3"
      );
    });
  });
});
