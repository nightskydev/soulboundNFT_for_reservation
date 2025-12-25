import * as anchor from "@coral-xyz/anchor";
import { expect } from "chai";
import { testContext, initializeTestContext, assertAdminState, MINT_FEE, MAX_SUPPLY, MINT_START_DATE, DONGLE_PRICE_NFT_HOLDER, DONGLE_PRICE_NORMAL } from "./setup";
import { Keypair, PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";

describe("update_admin", () => {
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
  });

  describe("update_mint_fee", () => {
    it("should update mint fee successfully", async () => {
      const newMintFee = new anchor.BN(2000000); // 2 USDC

      const tx = await testContext.program.methods
        .updateMintFee(newMintFee)
        .accounts({
          superAdmin: testContext.admin.publicKey,
          adminState: testContext.adminStatePda,
        })
        .signers([testContext.admin])
        .rpc();

      expect(tx).to.be.a("string");
      await assertAdminState({ mintFee: newMintFee });
    });

    it("should fail with invalid mint fee (zero)", async () => {
      const invalidMintFee = new anchor.BN(0);

      try {
        await testContext.program.methods
          .updateMintFee(invalidMintFee)
          .accounts({
            superAdmin: testContext.admin.publicKey,
            adminState: testContext.adminStatePda,
          })
          .signers([testContext.admin])
          .rpc();

        expect.fail("Expected transaction to fail with invalid mint fee");
      } catch (error: any) {
        expect(error.toString()).to.include("InvalidMintFee");
      }
    });

    it("should fail when non-admin tries to update mint fee", async () => {
      const newMintFee = new anchor.BN(3000000);

      try {
        await testContext.program.methods
          .updateMintFee(newMintFee)
          .accounts({
            superAdmin: testContext.user1.keypair.publicKey, // Non-admin
            adminState: testContext.adminStatePda,
          })
          .signers([testContext.user1.keypair])
          .rpc();

        expect.fail("Expected transaction to fail with non-admin signer");
      } catch (error: any) {
        expect(error.toString()).to.include("Unauthorized");
      }
    });
  });

  describe("update_max_supply", () => {
    it("should update max supply successfully", async () => {
      const newMaxSupply = new anchor.BN(2000);

      const tx = await testContext.program.methods
        .updateMaxSupply(newMaxSupply)
        .accounts({
          superAdmin: testContext.admin.publicKey,
          adminState: testContext.adminStatePda,
        })
        .signers([testContext.admin])
        .rpc();

      expect(tx).to.be.a("string");
      await assertAdminState({ maxSupply: newMaxSupply });
    });

    it("should update max supply to unlimited (zero)", async () => {
      const newMaxSupply = new anchor.BN(0); // Unlimited

      const tx = await testContext.program.methods
        .updateMaxSupply(newMaxSupply)
        .accounts({
          superAdmin: testContext.admin.publicKey,
          adminState: testContext.adminStatePda,
        })
        .signers([testContext.admin])
        .rpc();

      expect(tx).to.be.a("string");
      await assertAdminState({ maxSupply: newMaxSupply });
    });
  });

  describe("update_mint_start_date", () => {
    it("should update mint start date successfully", async () => {
      const newMintStartDate = new anchor.BN(Math.floor(Date.now() / 1000) + 86400); // Tomorrow

      const tx = await testContext.program.methods
        .updateMintStartDate(newMintStartDate)
        .accounts({
          superAdmin: testContext.admin.publicKey,
          adminState: testContext.adminStatePda,
        })
        .signers([testContext.admin])
        .rpc();

      expect(tx).to.be.a("string");
      await assertAdminState({ mintStartDate: newMintStartDate });
    });

    it("should allow setting mint start date to zero (no restriction)", async () => {
      const newMintStartDate = new anchor.BN(0); // No restriction

      const tx = await testContext.program.methods
        .updateMintStartDate(newMintStartDate)
        .accounts({
          superAdmin: testContext.admin.publicKey,
          adminState: testContext.adminStatePda,
        })
        .signers([testContext.admin])
        .rpc();

      expect(tx).to.be.a("string");
      await assertAdminState({ mintStartDate: newMintStartDate });
    });
  });

  describe("update_dongle_price_nft_holder", () => {
    it("should update dongle price for NFT holders successfully", async () => {
      const newPrice = new anchor.BN(200000000); // 200 USDC

      const tx = await testContext.program.methods
        .updateDonglePriceNftHolder(newPrice)
        .accounts({
          superAdmin: testContext.admin.publicKey,
          adminState: testContext.adminStatePda,
        })
        .signers([testContext.admin])
        .rpc();

      expect(tx).to.be.a("string");
      await assertAdminState({ donglePriceNftHolder: newPrice });
    });

    it("should fail with invalid dongle price for NFT holders (zero)", async () => {
      const invalidPrice = new anchor.BN(0);

      try {
        await testContext.program.methods
          .updateDonglePriceNftHolder(invalidPrice)
          .accounts({
            superAdmin: testContext.admin.publicKey,
            adminState: testContext.adminStatePda,
          })
          .signers([testContext.admin])
          .rpc();

        expect.fail("Expected transaction to fail with invalid dongle price");
      } catch (error: any) {
        expect(error.toString()).to.include("InvalidDonglePrice");
      }
    });
  });

  describe("update_dongle_price_normal", () => {
    it("should update dongle price for normal users successfully", async () => {
      const newPrice = new anchor.BN(600000000); // 600 USDC

      const tx = await testContext.program.methods
        .updateDonglePriceNormal(newPrice)
        .accounts({
          superAdmin: testContext.admin.publicKey,
          adminState: testContext.adminStatePda,
        })
        .signers([testContext.admin])
        .rpc();

      expect(tx).to.be.a("string");
      await assertAdminState({ donglePriceNormal: newPrice });
    });

    it("should fail with invalid dongle price for normal users (zero)", async () => {
      const invalidPrice = new anchor.BN(0);

      try {
        await testContext.program.methods
          .updateDonglePriceNormal(invalidPrice)
          .accounts({
            superAdmin: testContext.admin.publicKey,
            adminState: testContext.adminStatePda,
          })
          .signers([testContext.admin])
          .rpc();

        expect.fail("Expected transaction to fail with invalid dongle price");
      } catch (error: any) {
        expect(error.toString()).to.include("InvalidDonglePrice");
      }
    });
  });

  describe("update_purchase_started", () => {
    it("should enable purchase started flag", async () => {
      const tx = await testContext.program.methods
        .updatePurchaseStarted(true)
        .accounts({
          superAdmin: testContext.admin.publicKey,
          adminState: testContext.adminStatePda,
        })
        .signers([testContext.admin])
        .rpc();

      expect(tx).to.be.a("string");
      await assertAdminState({ purchaseStarted: true });
    });

    it("should disable purchase started flag", async () => {
      const tx = await testContext.program.methods
        .updatePurchaseStarted(false)
        .accounts({
          superAdmin: testContext.admin.publicKey,
          adminState: testContext.adminStatePda,
        })
        .signers([testContext.admin])
        .rpc();

      expect(tx).to.be.a("string");
      await assertAdminState({ purchaseStarted: false });
    });
  });

  describe("update_og_collection", () => {
    it("should update OG collection successfully", async () => {
      const newOgCollection = Keypair.generate().publicKey;

      const tx = await testContext.program.methods
        .updateOgCollection(newOgCollection)
        .accounts({
          superAdmin: testContext.admin.publicKey,
          adminState: testContext.adminStatePda,
        })
        .signers([testContext.admin])
        .rpc();

      expect(tx).to.be.a("string");
      await assertAdminState({ ogCollection: newOgCollection });
    });

    it("should fail with invalid OG collection (default pubkey)", async () => {
      const invalidCollection = PublicKey.default;

      try {
        await testContext.program.methods
          .updateOgCollection(invalidCollection)
          .accounts({
            superAdmin: testContext.admin.publicKey,
            adminState: testContext.adminStatePda,
          })
          .signers([testContext.admin])
          .rpc();

        expect.fail("Expected transaction to fail with invalid collection");
      } catch (error: any) {
        expect(error.toString()).to.include("InvalidCollection");
      }
    });
  });

  describe("update_dongle_proof_collection", () => {
    it("should update dongle proof collection successfully", async () => {
      const newDongleProofCollection = Keypair.generate().publicKey;

      const tx = await testContext.program.methods
        .updateDongleProofCollection(newDongleProofCollection)
        .accounts({
          superAdmin: testContext.admin.publicKey,
          adminState: testContext.adminStatePda,
        })
        .signers([testContext.admin])
        .rpc();

      expect(tx).to.be.a("string");
      await assertAdminState({ dongleProofCollection: newDongleProofCollection });
    });

    it("should fail with invalid dongle proof collection (default pubkey)", async () => {
      const invalidCollection = PublicKey.default;

      try {
        await testContext.program.methods
          .updateDongleProofCollection(invalidCollection)
          .accounts({
            superAdmin: testContext.admin.publicKey,
            adminState: testContext.adminStatePda,
          })
          .signers([testContext.admin])
          .rpc();

        expect.fail("Expected transaction to fail with invalid collection");
      } catch (error: any) {
        expect(error.toString()).to.include("InvalidCollection");
      }
    });
  });

  describe("update_super_admin", () => {
    it("should update super admin successfully", async () => {
      const newSuperAdmin = testContext.user1.keypair.publicKey;

      const tx = await testContext.program.methods
        .updateSuperAdmin(newSuperAdmin)
        .accounts({
          superAdmin: testContext.admin.publicKey,
          adminState: testContext.adminStatePda,
        })
        .signers([testContext.admin])
        .rpc();

      expect(tx).to.be.a("string");
      await assertAdminState({ superAdmin: newSuperAdmin });

      // Change it back for other tests
      const tx2 = await testContext.program.methods
        .updateSuperAdmin(testContext.admin.publicKey)
        .accounts({
          superAdmin: newSuperAdmin, // New admin signs
          adminState: testContext.adminStatePda,
        })
        .signers([testContext.user1.keypair])
        .rpc();

      expect(tx2).to.be.a("string");
      await assertAdminState({ superAdmin: testContext.admin.publicKey });
    });

    it("should fail with invalid super admin (default pubkey)", async () => {
      const invalidSuperAdmin = PublicKey.default;

      try {
        await testContext.program.methods
          .updateSuperAdmin(invalidSuperAdmin)
          .accounts({
            superAdmin: testContext.admin.publicKey,
            adminState: testContext.adminStatePda,
          })
          .signers([testContext.admin])
          .rpc();

        expect.fail("Expected transaction to fail with invalid super admin");
      } catch (error: any) {
        expect(error.toString()).to.include("InvalidSuperAdmin");
      }
    });

    it("should fail when trying to set same super admin", async () => {
      try {
        await testContext.program.methods
          .updateSuperAdmin(testContext.admin.publicKey) // Same as current
          .accounts({
            superAdmin: testContext.admin.publicKey,
            adminState: testContext.adminStatePda,
          })
          .signers([testContext.admin])
          .rpc();

        expect.fail("Expected transaction to fail with same super admin");
      } catch (error: any) {
        expect(error.toString()).to.include("SameSuperAdmin");
      }
    });
  });
});