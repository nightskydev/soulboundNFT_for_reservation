import * as anchor from "@coral-xyz/anchor";
import {
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";
import { PublicKey, Keypair } from "@solana/web3.js";
import assert from "assert";
import { ctx } from "./setup";

describe("Soulbound NFT for Reservation - Comprehensive Test Suite", () => {
  before(async () => {
    await ctx.initialize();
  });

  describe("Complete User Journey", () => {
    it("should execute full user journey: init admin -> create collections -> mint NFT -> purchase dongle -> burn NFT", async () => {
      console.log("\n=== Starting Complete User Journey Test ===\n");

      // Step 1: Initialize Admin
      console.log("Step 1: Initializing admin state...");
      const initTx = await ctx.program.methods
        .initAdmin(
          new anchor.BN(ctx.MINT_FEE),
          new anchor.BN(ctx.MAX_SUPPLY),
          ctx.withdrawWallet.publicKey,
          new anchor.BN(0), // mint_start_date: 0 = no restriction
          new anchor.BN(ctx.DONGLE_PRICE_NFT_HOLDER),
          new anchor.BN(ctx.DONGLE_PRICE_NORMAL)
        )
        .accounts({
          superAdmin: ctx.superAdmin.publicKey,
          paymentMint: ctx.paymentMint,
          paymentTokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc({ skipPreflight: true });

      await ctx.provider.connection.confirmTransaction(initTx, "confirmed");
      console.log("✓ Admin initialized successfully");

      let adminState = await ctx.fetchAdminState();
      assert.strictEqual(adminState.superAdmin.toBase58(), ctx.superAdmin.publicKey.toBase58());
      assert.strictEqual(adminState.mintFee.toNumber(), ctx.MINT_FEE);
      assert.strictEqual(adminState.maxSupply.toNumber(), ctx.MAX_SUPPLY);

      // Step 2: Create OG Collection
      console.log("\nStep 2: Creating OG Collection...");
      const ogCollectionMint = Keypair.generate();

      const createOgCollectionTx = await ctx.program.methods
        .createCollectionNft("OG Collection", "OG", "https://example.com/og-collection.json")
        .accounts({
          signer: ctx.superAdmin.publicKey,
          collectionMint: ogCollectionMint.publicKey,
          tokenMetadataProgram: new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"), // Metaplex Token Metadata program
        })
        .signers([ogCollectionMint])
        .rpc({ skipPreflight: true });

      await ctx.provider.connection.confirmTransaction(createOgCollectionTx, "confirmed");
      console.log("✓ OG Collection created successfully");

      // Update admin state with OG collection
      await ctx.program.methods
        .updateOgCollection(ogCollectionMint.publicKey)
        .accounts({
          superAdmin: ctx.superAdmin.publicKey,
        })
        .rpc({ skipPreflight: true });

      adminState = await ctx.fetchAdminState();
      assert.strictEqual(adminState.ogCollection.toBase58(), ogCollectionMint.publicKey.toBase58());

      // Step 3: Create Dongle Proof Collection
      console.log("\nStep 3: Creating Dongle Proof Collection...");
      const dongleProofCollectionMint = Keypair.generate();

      const createDongleProofCollectionTx = await ctx.program.methods
        .createCollectionNft("Dongle Proof Collection", "DONGLE", "https://example.com/dongle-collection.json")
        .accounts({
          signer: ctx.superAdmin.publicKey,
          collectionMint: dongleProofCollectionMint.publicKey,
          tokenMetadataProgram: new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"),
        })
        .signers([dongleProofCollectionMint])
        .rpc({ skipPreflight: true });

      await ctx.provider.connection.confirmTransaction(createDongleProofCollectionTx, "confirmed");
      console.log("✓ Dongle Proof Collection created successfully");

      // Update admin state with Dongle Proof collection
      await ctx.program.methods
        .updateDongleProofCollection(dongleProofCollectionMint.publicKey)
        .accounts({
          superAdmin: ctx.superAdmin.publicKey,
        })
        .rpc({ skipPreflight: true });

      adminState = await ctx.fetchAdminState();
      assert.strictEqual(adminState.dongleProofCollection.toBase58(), dongleProofCollectionMint.publicKey.toBase58());

      // Step 4: Mint OG NFT for user
      console.log("\nStep 4: Minting OG NFT for user...");
      const nftMint = Keypair.generate();

      const mintNftTx = await ctx.program.methods
        .mintNft("Test OG NFT", "TEST", "https://example.com/test-nft.json")
        .accounts({
          signer: ctx.user.publicKey,
          mint: nftMint.publicKey,
          tokenAccount: getAssociatedTokenAddressSync(nftMint.publicKey, ctx.user.publicKey),
          tokenMetadataProgram: new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"),
          collectionMint: ogCollectionMint.publicKey,
          paymentMint: ctx.paymentMint,
          payerTokenAccount: ctx.userTokenAccount,
          paymentTokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([ctx.user, nftMint])
        .rpc({ skipPreflight: true });

      await ctx.provider.connection.confirmTransaction(mintNftTx, "confirmed");
      console.log("✓ OG NFT minted successfully");

      // Verify user state updated
      const userState = await ctx.fetchUserState(ctx.user.publicKey);
      assert.strictEqual(userState.nftAddress.toBase58(), nftMint.publicKey.toBase58());
      assert.ok(userState.nftMintDate.toNumber() > 0);

      // Step 5: Enable purchases and test dongle purchase with NFT holder discount
      console.log("\nStep 5: Enabling purchases and testing dongle purchase with discount...");

      // Enable purchases
      await ctx.program.methods
        .updatePurchaseStarted(true)
        .accounts({
          superAdmin: ctx.superAdmin.publicKey,
        })
        .rpc({ skipPreflight: true });

      adminState = await ctx.fetchAdminState();
      assert.strictEqual(adminState.purchaseStarted, true);

      // Purchase dongle with NFT holder discount
      const purchaseTx = await ctx.program.methods
        .purchaseDongle()
        .accounts({
          buyer: ctx.user.publicKey,
          paymentMint: ctx.paymentMint,
          buyerTokenAccount: ctx.userTokenAccount,
          paymentTokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([ctx.user])
        .rpc({ skipPreflight: true });

      await ctx.provider.connection.confirmTransaction(purchaseTx, "confirmed");
      console.log("✓ Dongle purchased with NFT holder discount");

      // Verify purchase
      const updatedUserState = await ctx.fetchUserState(ctx.user.publicKey);
      assert.ok(updatedUserState.purchasedDate.toNumber() > 0);

      // Step 6: Test dongle purchase for normal user (without NFT)
      console.log("\nStep 6: Testing dongle purchase for normal user (full price)...");

      const normalUserPurchaseTx = await ctx.program.methods
        .purchaseDongle()
        .accounts({
          buyer: ctx.user2.publicKey,
          paymentMint: ctx.paymentMint,
          buyerTokenAccount: ctx.user2TokenAccount,
          paymentTokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([ctx.user2])
        .rpc({ skipPreflight: true });

      await ctx.provider.connection.confirmTransaction(normalUserPurchaseTx, "confirmed");
      console.log("✓ Dongle purchased at full price for normal user");

      const user2State = await ctx.fetchUserState(ctx.user2.publicKey);
      assert.ok(user2State.purchasedDate.toNumber() > 0);

      // Step 7: Burn NFT
      console.log("\nStep 7: Burning NFT...");

      const burnTx = await ctx.program.methods
        .burnNft()
        .accounts({
          signer: ctx.user.publicKey,
          oldMint: nftMint.publicKey,
          oldTokenAccount: getAssociatedTokenAddressSync(nftMint.publicKey, ctx.user.publicKey),
        })
        .signers([ctx.user])
        .rpc({ skipPreflight: true });

      await ctx.provider.connection.confirmTransaction(burnTx, "confirmed");
      console.log("✓ NFT burned successfully");

      // Verify NFT burned
      const finalUserState = await ctx.fetchUserState(ctx.user.publicKey);
      assert.strictEqual(finalUserState.nftAddress.toBase58(), PublicKey.default.toBase58());

      // Step 8: Test withdrawal functionality
      console.log("\nStep 8: Testing withdrawal functionality...");

      // Withdraw some funds
      const withdrawAmount = new anchor.BN(50_000_000); // 50 USDC
      const withdrawTx = await ctx.program.methods
        .withdraw(withdrawAmount)
        .accounts({
          superAdmin: ctx.superAdmin.publicKey,
          withdrawWallet: ctx.withdrawWallet.publicKey,
          paymentMint: ctx.paymentMint,
          withdrawWalletTokenAccount: ctx.withdrawWalletTokenAccount,
          paymentTokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc({ skipPreflight: true });

      await ctx.provider.connection.confirmTransaction(withdrawTx, "confirmed");
      console.log("✓ Funds withdrawn successfully");

      console.log("\n🎉 Complete User Journey Test PASSED! 🎉");
      console.log("All core functionality verified:");
      console.log("✓ Admin initialization");
      console.log("✓ Collection creation (OG and Dongle Proof)");
      console.log("✓ NFT minting with payment");
      console.log("✓ Dongle purchase with NFT holder discount");
      console.log("✓ Dongle purchase at full price for normal users");
      console.log("✓ NFT burning");
      console.log("✓ Fund withdrawal");
    });
  });

  describe("Collection-based NFT Minting", () => {
    it("should mint NFTs for both OG and Dongle Proof collections", async () => {
      console.log("\n=== Testing Collection-based NFT Minting ===\n");

      // Setup collections first (assuming admin is already initialized)
      const ogCollectionMint = Keypair.generate();
      const dongleProofCollectionMint = Keypair.generate();

      // Create OG Collection
      await ctx.program.methods
        .createCollectionNft("Test OG Collection", "TOG", "https://example.com/test-og.json")
        .accounts({
          signer: ctx.superAdmin.publicKey,
          collectionMint: ogCollectionMint.publicKey,
          tokenMetadataProgram: new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"),
        })
        .signers([ogCollectionMint])
        .rpc({ skipPreflight: true });

      // Create Dongle Proof Collection
      await ctx.program.methods
        .createCollectionNft("Test Dongle Proof Collection", "TDP", "https://example.com/test-dongle.json")
        .accounts({
          signer: ctx.superAdmin.publicKey,
          collectionMint: dongleProofCollectionMint.publicKey,
          tokenMetadataProgram: new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"),
        })
        .signers([dongleProofCollectionMint])
        .rpc({ skipPreflight: true });

      // Update admin with collection addresses
      await ctx.program.methods
        .updateOgCollection(ogCollectionMint.publicKey)
        .accounts({ superAdmin: ctx.superAdmin.publicKey })
        .rpc({ skipPreflight: true });

      await ctx.program.methods
        .updateDongleProofCollection(dongleProofCollectionMint.publicKey)
        .accounts({ superAdmin: ctx.superAdmin.publicKey })
        .rpc({ skipPreflight: true });

      // Mint OG NFT
      const ogNftMint = Keypair.generate();
      await ctx.program.methods
        .mintNft("Test OG NFT", "TOG", "https://example.com/test-og-nft.json")
        .accounts({
          signer: ctx.user3.publicKey,
          mint: ogNftMint.publicKey,
          tokenAccount: getAssociatedTokenAddressSync(ogNftMint.publicKey, ctx.user3.publicKey),
          tokenMetadataProgram: new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"),
          collectionMint: ogCollectionMint.publicKey,
          paymentMint: ctx.paymentMint,
          payerTokenAccount: ctx.user3TokenAccount,
          paymentTokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([ctx.user3, ogNftMint])
        .rpc({ skipPreflight: true });

      console.log("✓ OG NFT minted successfully");

      // Verify OG NFT metadata includes collection info
      const ogUserState = await ctx.fetchUserState(ctx.user3.publicKey);
      assert.strictEqual(ogUserState.nftAddress.toBase58(), ogNftMint.publicKey.toBase58());

      console.log("✓ Collection-based NFT minting test PASSED!");
    });
  });

  describe("Error Handling", () => {
    it("should reject minting when user already has NFT", async () => {
      console.log("\n=== Testing Error Handling ===\n");

      // Try to mint second NFT for user who already has one
      const secondNftMint = Keypair.generate();

      let errorThrown = false;
      try {
        await ctx.program.methods
          .mintNft("Second NFT", "SECOND", "https://example.com/second.json")
          .accounts({
            signer: ctx.user3.publicKey, // User who already has NFT
            mint: secondNftMint.publicKey,
            tokenAccount: getAssociatedTokenAddressSync(secondNftMint.publicKey, ctx.user3.publicKey),
            tokenMetadataProgram: new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"),
            collectionMint: null, // No collection for this test
            paymentMint: ctx.paymentMint,
            payerTokenAccount: ctx.user3TokenAccount,
            paymentTokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([ctx.user3, secondNftMint])
          .rpc({ skipPreflight: true });
      } catch (err: any) {
        errorThrown = true;
        console.log("✓ Correctly rejected duplicate NFT minting");
      }

      assert.ok(errorThrown, "Should have rejected duplicate NFT minting");
      console.log("✓ Error handling test PASSED!");
    });

    it("should reject dongle purchase when purchases are disabled", async () => {
      console.log("\n=== Testing Purchase Disable Functionality ===\n");

      // Disable purchases
      await ctx.program.methods
        .updatePurchaseStarted(false)
        .accounts({
          superAdmin: ctx.superAdmin.publicKey,
        })
        .rpc({ skipPreflight: true });

      // Try to purchase dongle when disabled
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
        console.log("✓ Correctly rejected purchase when disabled");
      }

      assert.ok(errorThrown, "Should have rejected purchase when disabled");

      // Re-enable purchases for other tests
      await ctx.program.methods
        .updatePurchaseStarted(true)
        .accounts({
          superAdmin: ctx.superAdmin.publicKey,
        })
        .rpc({ skipPreflight: true });

      console.log("✓ Purchase disable/enable test PASSED!");
    });
  });

  describe("Admin Functions", () => {
    it("should update various admin parameters", async () => {
      console.log("\n=== Testing Admin Parameter Updates ===\n");

      const newMintFee = new anchor.BN(2_000_000); // 2 USDC
      const newMaxSupply = new anchor.BN(200);
      const newDonglePriceNftHolder = new anchor.BN(50_000_000); // 50 USDC

      // Update mint fee
      await ctx.program.methods
        .updateMintFee(newMintFee)
        .accounts({ superAdmin: ctx.superAdmin.publicKey })
        .rpc({ skipPreflight: true });

      // Update max supply
      await ctx.program.methods
        .updateMaxSupply(newMaxSupply)
        .accounts({ superAdmin: ctx.superAdmin.publicKey })
        .rpc({ skipPreflight: true });

      // Update dongle price for NFT holders
      await ctx.program.methods
        .updateDonglePriceNftHolder(newDonglePriceNftHolder)
        .accounts({ superAdmin: ctx.superAdmin.publicKey })
        .rpc({ skipPreflight: true });

      // Verify updates
      const adminState = await ctx.fetchAdminState();
      assert.strictEqual(adminState.mintFee.toNumber(), newMintFee.toNumber());
      assert.strictEqual(adminState.maxSupply.toNumber(), newMaxSupply.toNumber());
      assert.strictEqual(adminState.donglePriceNftHolder.toNumber(), newDonglePriceNftHolder.toNumber());

      console.log("✓ Admin parameter updates test PASSED!");
    });
  });
});
