import * as anchor from "@coral-xyz/anchor";
import { expect } from "chai";
import { 
  testContext, 
  initializeTestContext, 
  assertAdminState, 
  OG_MINT_FEE,
  REGULAR_MINT_FEE,
  BASIC_MINT_FEE,
  OG_MAX_SUPPLY,
  REGULAR_MAX_SUPPLY,
  BASIC_MAX_SUPPLY,
  MINT_START_DATE
} from "./setup";
import { Keypair, PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { BN } from "bn.js";

describe("update_admin", () => {
  before(async () => {
    await initializeTestContext();
    
    // Initialize admin if not already done
    if (!testContext.adminInitialized) {
      // Use placeholders - admin should already be initialized by test 1
      const ogCollectionMint = Keypair.generate().publicKey;
      const regularCollectionMint = Keypair.generate().publicKey;
      const basicCollectionMint = Keypair.generate().publicKey;

      await testContext.program.methods
        .initAdmin(
          ogCollectionMint,
          OG_MINT_FEE,
          OG_MAX_SUPPLY,
          regularCollectionMint,
          REGULAR_MINT_FEE,
          REGULAR_MAX_SUPPLY,
          basicCollectionMint,
          BASIC_MINT_FEE,
          BASIC_MAX_SUPPLY,
          testContext.withdrawWallet.publicKey,
          MINT_START_DATE
        )
        .accounts({
          superAdmin: testContext.admin.publicKey,
          paymentMint: testContext.usdcMint,
          paymentTokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([testContext.admin])
        .rpc();
        
      testContext.ogCollectionMint = ogCollectionMint;
      testContext.regularCollectionMint = regularCollectionMint;
      testContext.basicCollectionMint = basicCollectionMint;
      testContext.adminInitialized = true;
    }
  });

  describe("update_mint_fee", () => {
    it("should update mint fee successfully", async () => {
      const newMintFee = new anchor.BN(6000000); // 6 USDC for OG

      const tx = await testContext.program.methods
        .updateMintFee({ og: {} }, newMintFee)
        .accounts({
          superAdmin: testContext.admin.publicKey,
        })
        .signers([testContext.admin])
        .rpc();

      expect(tx).to.be.a("string");
      const adminState = await testContext.fetchAdminState();
      expect(adminState.ogCollection.mintFee.toString()).to.equal(newMintFee.toString());

      // Reset to original value for other tests
      await testContext.program.methods
        .updateMintFee({ og: {} }, OG_MINT_FEE)
        .accounts({
          superAdmin: testContext.admin.publicKey,
        })
        .signers([testContext.admin])
        .rpc();
    });

    it("should fail with invalid mint fee (zero)", async () => {
      const invalidMintFee = new anchor.BN(0);

      try {
        await testContext.program.methods
          .updateMintFee({ og: {} }, invalidMintFee)
          .accounts({
            superAdmin: testContext.admin.publicKey,
          })
          .signers([testContext.admin])
          .rpc();

        expect.fail("Expected transaction to fail with invalid mint fee");
      } catch (error: any) {
        expect(error.toString()).to.include("InvalidMintFee");
      }
    });

    it("should fail when non-admin tries to update mint fee", async () => {
      const newMintFee = new anchor.BN(7000000);

      try {
        await testContext.program.methods
          .updateMintFee({ og: {} }, newMintFee)
          .accounts({
            superAdmin: testContext.user1.keypair.publicKey, // Non-admin
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
      const newMaxSupply = new anchor.BN(200); // Update OG to 200

      const tx = await testContext.program.methods
        .updateMaxSupply({ og: {} }, newMaxSupply)
        .accounts({
          superAdmin: testContext.admin.publicKey,
        })
        .signers([testContext.admin])
        .rpc();

      expect(tx).to.be.a("string");
      const adminState = await testContext.fetchAdminState();
      expect(adminState.ogCollection.maxSupply.toString()).to.equal(newMaxSupply.toString());
    });

    it("should update max supply to unlimited (zero)", async () => {
      const newMaxSupply = new anchor.BN(0); // Unlimited

      const tx = await testContext.program.methods
        .updateMaxSupply({ regular: {} }, newMaxSupply)
        .accounts({
          superAdmin: testContext.admin.publicKey,
        })
        .signers([testContext.admin])
        .rpc();

      expect(tx).to.be.a("string");
      const adminState = await testContext.fetchAdminState();
      expect(adminState.regularCollection.maxSupply.toString()).to.equal(newMaxSupply.toString());
    });
  });

  describe("update_mint_start_date", () => {
    it("should update mint start date successfully", async () => {
      const newMintStartDate = new anchor.BN(Math.floor(Date.now() / 1000) + 86400); // Tomorrow

      const tx = await testContext.program.methods
        .updateMintStartDate(newMintStartDate)
        .accounts({
          superAdmin: testContext.admin.publicKey,
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
        })
        .signers([testContext.admin])
        .rpc();

      expect(tx).to.be.a("string");
      await assertAdminState({ mintStartDate: newMintStartDate });
    });
  });

  describe("update_collection_mint", () => {
    it("should update OG collection mint successfully", async () => {
      const newOgCollectionMint = Keypair.generate().publicKey;

      const tx = await testContext.program.methods
        .updateCollectionMint({ og: {} }, newOgCollectionMint)
        .accounts({
          superAdmin: testContext.admin.publicKey,
        })
        .signers([testContext.admin])
        .rpc();

      expect(tx).to.be.a("string");
      const adminState = await testContext.fetchAdminState();
      expect(adminState.ogCollection.collectionMint.toString()).to.equal(newOgCollectionMint.toString());
      
      // Restore original for other tests
      await testContext.program.methods
        .updateCollectionMint({ og: {} }, testContext.ogCollectionMint!)
        .accounts({
          superAdmin: testContext.admin.publicKey,
        })
        .signers([testContext.admin])
        .rpc();
    });

    it("should fail with invalid collection mint (default pubkey)", async () => {
      const invalidCollection = PublicKey.default;

      try {
        await testContext.program.methods
          .updateCollectionMint({ og: {} }, invalidCollection)
          .accounts({
            superAdmin: testContext.admin.publicKey,
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
