import { Keypair, PublicKey } from "@solana/web3.js";
import assert from "assert";
import { ctx } from "./setup";

describe("set_admin_wallet (multisig)", () => {
  // New admin wallets for testing
  let newSuperAdmin: Keypair;
  let newViceAdmin1: Keypair;
  let newViceAdmin2: Keypair;
  let newViceAdmin3: Keypair;
  let newViceAdmin4: Keypair;

  before(async () => {
    await ctx.initialize();

    // Create new admin keypairs for proposal testing
    newSuperAdmin = Keypair.generate();
    newViceAdmin1 = Keypair.generate();
    newViceAdmin2 = Keypair.generate();
    newViceAdmin3 = Keypair.generate();
    newViceAdmin4 = Keypair.generate();

    // Airdrop SOL to new super admin
    const sig = await ctx.provider.connection.requestAirdrop(
      newSuperAdmin.publicKey,
      2e9
    );
    await ctx.provider.connection.confirmTransaction(sig, "confirmed");
  });

  describe("Multisig Proposal Flow", () => {
    it("should create a new admin wallet proposal (first approval from super_admin)", async () => {
      const adminWallets: [PublicKey, PublicKey, PublicKey, PublicKey, PublicKey] = [
        newSuperAdmin.publicKey,
        newViceAdmin1.publicKey,
        newViceAdmin2.publicKey,
        newViceAdmin3.publicKey,
        newViceAdmin4.publicKey,
      ];

      const tx = await ctx.program.methods
        .setAdminWallet(adminWallets)
        .accounts({
          signer: ctx.superAdmin.publicKey,
        })
        .rpc({ skipPreflight: true });

      await ctx.provider.connection.confirmTransaction(tx, "confirmed");
      console.log("Proposal created tx:", tx);

      const state = await ctx.fetchAdminState();
      console.log("Pending admin wallets:");
      console.log("  Super admin:", state.pendingAdminWallets[0].toBase58());
      for (let i = 1; i < 5; i++) {
        console.log(`  Vice admin ${i}:`, state.pendingAdminWallets[i].toBase58());
      }

      // Verify proposal is pending
      assert.strictEqual(
        state.pendingAdminWallets[0].toBase58(),
        newSuperAdmin.publicKey.toBase58(),
        "Pending super admin should match"
      );

      // Original admins should still be active
      assert.strictEqual(
        state.superAdmin.toBase58(),
        ctx.superAdmin.publicKey.toBase58(),
        "Super admin should not change yet"
      );

      console.log("✓ Proposal created with 1/3 approvals");
    });

    it("should add second approval from vice_admin1", async () => {
      const adminWallets: [PublicKey, PublicKey, PublicKey, PublicKey, PublicKey] = [
        newSuperAdmin.publicKey,
        newViceAdmin1.publicKey,
        newViceAdmin2.publicKey,
        newViceAdmin3.publicKey,
        newViceAdmin4.publicKey,
      ];

      const tx = await ctx.program.methods
        .setAdminWallet(adminWallets)
        .accounts({
          signer: ctx.viceAdmin1.publicKey,
        })
        .signers([ctx.viceAdmin1])
        .rpc({ skipPreflight: true });

      await ctx.provider.connection.confirmTransaction(tx, "confirmed");
      console.log("Second approval tx:", tx);

      const state = await ctx.fetchAdminState();
      // Still pending, not yet applied
      assert.strictEqual(
        state.superAdmin.toBase58(),
        ctx.superAdmin.publicKey.toBase58(),
        "Super admin should not change yet (2/3 approvals)"
      );

      console.log("✓ Second approval added (2/3 approvals)");
    });

    it("should apply admin wallets on third approval (threshold reached)", async () => {
      const adminWallets: [PublicKey, PublicKey, PublicKey, PublicKey, PublicKey] = [
        newSuperAdmin.publicKey,
        newViceAdmin1.publicKey,
        newViceAdmin2.publicKey,
        newViceAdmin3.publicKey,
        newViceAdmin4.publicKey,
      ];

      const tx = await ctx.program.methods
        .setAdminWallet(adminWallets)
        .accounts({
          signer: ctx.viceAdmin2.publicKey,
        })
        .signers([ctx.viceAdmin2])
        .rpc({ skipPreflight: true });

      await ctx.provider.connection.confirmTransaction(tx, "confirmed");
      console.log("Third approval tx:", tx);

      const state = await ctx.fetchAdminState();
      
      // Now the admin wallets should be updated!
      assert.strictEqual(
        state.superAdmin.toBase58(),
        newSuperAdmin.publicKey.toBase58(),
        "Super admin should be updated"
      );

      assert.strictEqual(
        state.viceAdmins[0].toBase58(),
        newViceAdmin1.publicKey.toBase58(),
        "Vice admin 1 should be updated"
      );
      assert.strictEqual(
        state.viceAdmins[1].toBase58(),
        newViceAdmin2.publicKey.toBase58(),
        "Vice admin 2 should be updated"
      );
      assert.strictEqual(
        state.viceAdmins[2].toBase58(),
        newViceAdmin3.publicKey.toBase58(),
        "Vice admin 3 should be updated"
      );
      assert.strictEqual(
        state.viceAdmins[3].toBase58(),
        newViceAdmin4.publicKey.toBase58(),
        "Vice admin 4 should be updated"
      );

      // Pending proposal should be cleared
      assert.strictEqual(
        state.pendingAdminWallets[0].toBase58(),
        PublicKey.default.toBase58(),
        "Pending proposal should be cleared"
      );

      console.log("✓ Admin wallets updated after 3/3 approvals!");
      console.log("New super admin:", state.superAdmin.toBase58());
    });

    it("should restore original admins for subsequent tests", async () => {
      // Now the new admins need to approve changing back to original admins
      const originalAdminWallets: [PublicKey, PublicKey, PublicKey, PublicKey, PublicKey] = [
        ctx.superAdmin.publicKey,
        ctx.viceAdmin1.publicKey,
        ctx.viceAdmin2.publicKey,
        ctx.viceAdmin3.publicKey,
        ctx.viceAdmin4.publicKey,
      ];

      // First approval from newSuperAdmin
      await ctx.program.methods
        .setAdminWallet(originalAdminWallets)
        .accounts({
          signer: newSuperAdmin.publicKey,
        })
        .signers([newSuperAdmin])
        .rpc({ skipPreflight: true });

      // Second approval from newViceAdmin1
      const sig1 = await ctx.provider.connection.requestAirdrop(
        newViceAdmin1.publicKey,
        1e9
      );
      await ctx.provider.connection.confirmTransaction(sig1, "confirmed");

      await ctx.program.methods
        .setAdminWallet(originalAdminWallets)
        .accounts({
          signer: newViceAdmin1.publicKey,
        })
        .signers([newViceAdmin1])
        .rpc({ skipPreflight: true });

      // Third approval from newViceAdmin2 (threshold reached)
      const sig2 = await ctx.provider.connection.requestAirdrop(
        newViceAdmin2.publicKey,
        1e9
      );
      await ctx.provider.connection.confirmTransaction(sig2, "confirmed");

      await ctx.program.methods
        .setAdminWallet(originalAdminWallets)
        .accounts({
          signer: newViceAdmin2.publicKey,
        })
        .signers([newViceAdmin2])
        .rpc({ skipPreflight: true });

      const state = await ctx.fetchAdminState();
      assert.strictEqual(
        state.superAdmin.toBase58(),
        ctx.superAdmin.publicKey.toBase58(),
        "Super admin should be restored"
      );

      console.log("✓ Original admins restored");
    });
  });

  describe("Failure Cases", () => {
    it("should fail when non-multisig member tries to propose (NotMultisigMember)", async () => {
      const randomUser = Keypair.generate();
      const sig = await ctx.provider.connection.requestAirdrop(
        randomUser.publicKey,
        1e9
      );
      await ctx.provider.connection.confirmTransaction(sig, "confirmed");

      const adminWallets: [PublicKey, PublicKey, PublicKey, PublicKey, PublicKey] = [
        randomUser.publicKey,
        ctx.viceAdmin1.publicKey,
        ctx.viceAdmin2.publicKey,
        ctx.viceAdmin3.publicKey,
        ctx.viceAdmin4.publicKey,
      ];

      let errorThrown = false;
      try {
        await ctx.program.methods
          .setAdminWallet(adminWallets)
          .accounts({
            signer: randomUser.publicKey,
          })
          .signers([randomUser])
          .rpc({ skipPreflight: true });
      } catch (err: any) {
        errorThrown = true;
        console.log("✓ Correctly rejected non-multisig member");
      }

      assert.ok(errorThrown, "Should have rejected non-multisig member");
    });

    it("should fail when super admin is empty (InvalidSuperAdmin)", async () => {
      const adminWallets: [PublicKey, PublicKey, PublicKey, PublicKey, PublicKey] = [
        PublicKey.default, // Empty super admin - should fail!
        ctx.viceAdmin1.publicKey,
        ctx.viceAdmin2.publicKey,
        ctx.viceAdmin3.publicKey,
        ctx.viceAdmin4.publicKey,
      ];

      let errorThrown = false;
      try {
        await ctx.program.methods
          .setAdminWallet(adminWallets)
          .accounts({
            signer: ctx.superAdmin.publicKey,
          })
          .rpc({ skipPreflight: true });
      } catch (err: any) {
        errorThrown = true;
        console.log("✓ Correctly rejected empty super admin");
      }

      assert.ok(errorThrown, "Should have rejected empty super admin");
    });

    it("should fail when vice admin is same as super admin (InvalidViceAdmin)", async () => {
      const adminWallets: [PublicKey, PublicKey, PublicKey, PublicKey, PublicKey] = [
        ctx.superAdmin.publicKey,
        ctx.superAdmin.publicKey, // Same as super admin - should fail!
        ctx.viceAdmin2.publicKey,
        ctx.viceAdmin3.publicKey,
        ctx.viceAdmin4.publicKey,
      ];

      let errorThrown = false;
      try {
        await ctx.program.methods
          .setAdminWallet(adminWallets)
          .accounts({
            signer: ctx.superAdmin.publicKey,
          })
          .rpc({ skipPreflight: true });
      } catch (err: any) {
        errorThrown = true;
        console.log("✓ Correctly rejected vice admin same as super admin");
      }

      assert.ok(errorThrown, "Should have rejected vice admin same as super admin");
    });

    it("should fail with duplicate vice admin addresses (DuplicateViceAdmin)", async () => {
      const adminWallets: [PublicKey, PublicKey, PublicKey, PublicKey, PublicKey] = [
        newSuperAdmin.publicKey,
        ctx.viceAdmin1.publicKey,
        ctx.viceAdmin1.publicKey, // Duplicate!
        ctx.viceAdmin3.publicKey,
        ctx.viceAdmin4.publicKey,
      ];

      let errorThrown = false;
      try {
        await ctx.program.methods
          .setAdminWallet(adminWallets)
          .accounts({
            signer: ctx.superAdmin.publicKey,
          })
          .rpc({ skipPreflight: true });
      } catch (err: any) {
        errorThrown = true;
        console.log("✓ Correctly rejected duplicate vice admin");
      }

      assert.ok(errorThrown, "Should have rejected duplicate vice admin");
    });

    it("should fail when signer already approved (AlreadyApproved)", async () => {
      // Create a new proposal
      const adminWallets: [PublicKey, PublicKey, PublicKey, PublicKey, PublicKey] = [
        newSuperAdmin.publicKey,
        newViceAdmin1.publicKey,
        newViceAdmin2.publicKey,
        newViceAdmin3.publicKey,
        newViceAdmin4.publicKey,
      ];

      await ctx.program.methods
        .setAdminWallet(adminWallets)
        .accounts({
          signer: ctx.superAdmin.publicKey,
        })
        .rpc({ skipPreflight: true });

      // Try to approve again with same signer
      let errorThrown = false;
      try {
        await ctx.program.methods
          .setAdminWallet(adminWallets)
          .accounts({
            signer: ctx.superAdmin.publicKey,
          })
          .rpc({ skipPreflight: true });
      } catch (err: any) {
        errorThrown = true;
        console.log("✓ Correctly rejected duplicate approval");
      }

      assert.ok(errorThrown, "Should have rejected duplicate approval");

      // Cancel the proposal for clean state
      await ctx.program.methods
        .cancelAdminWalletProposal()
        .accounts({
          signer: ctx.superAdmin.publicKey,
        })
        .rpc({ skipPreflight: true });
    });

    it("should fail when proposing different admin wallets while another is pending (DifferentProposalPending)", async () => {
      // Create a proposal
      const adminWallets1: [PublicKey, PublicKey, PublicKey, PublicKey, PublicKey] = [
        newSuperAdmin.publicKey,
        newViceAdmin1.publicKey,
        newViceAdmin2.publicKey,
        newViceAdmin3.publicKey,
        newViceAdmin4.publicKey,
      ];

      await ctx.program.methods
        .setAdminWallet(adminWallets1)
        .accounts({
          signer: ctx.superAdmin.publicKey,
        })
        .rpc({ skipPreflight: true });

      // Try to create a different proposal
      const differentAdmin = Keypair.generate();
      const adminWallets2: [PublicKey, PublicKey, PublicKey, PublicKey, PublicKey] = [
        differentAdmin.publicKey, // Different super admin
        newViceAdmin1.publicKey,
        newViceAdmin2.publicKey,
        newViceAdmin3.publicKey,
        newViceAdmin4.publicKey,
      ];

      let errorThrown = false;
      try {
        await ctx.program.methods
          .setAdminWallet(adminWallets2)
          .accounts({
            signer: ctx.viceAdmin1.publicKey,
          })
          .signers([ctx.viceAdmin1])
          .rpc({ skipPreflight: true });
      } catch (err: any) {
        errorThrown = true;
        console.log("✓ Correctly rejected different proposal while one is pending");
      }

      assert.ok(errorThrown, "Should have rejected different proposal");

      // Cancel the proposal for clean state
      await ctx.program.methods
        .cancelAdminWalletProposal()
        .accounts({
          signer: ctx.superAdmin.publicKey,
        })
        .rpc({ skipPreflight: true });
    });
  });

  describe("Cancel Proposal", () => {
    it("should cancel a pending admin wallet proposal", async () => {
      // Create a proposal
      const adminWallets: [PublicKey, PublicKey, PublicKey, PublicKey, PublicKey] = [
        newSuperAdmin.publicKey,
        newViceAdmin1.publicKey,
        newViceAdmin2.publicKey,
        newViceAdmin3.publicKey,
        newViceAdmin4.publicKey,
      ];

      await ctx.program.methods
        .setAdminWallet(adminWallets)
        .accounts({
          signer: ctx.superAdmin.publicKey,
        })
        .rpc({ skipPreflight: true });

      // Verify proposal exists
      let state = await ctx.fetchAdminState();
      assert.notStrictEqual(
        state.pendingAdminWallets[0].toBase58(),
        PublicKey.default.toBase58(),
        "Should have pending proposal"
      );

      // Cancel it
      const tx = await ctx.program.methods
        .cancelAdminWalletProposal()
        .accounts({
          signer: ctx.viceAdmin1.publicKey,
        })
        .signers([ctx.viceAdmin1])
        .rpc({ skipPreflight: true });

      await ctx.provider.connection.confirmTransaction(tx, "confirmed");

      // Verify proposal is cancelled
      state = await ctx.fetchAdminState();
      assert.strictEqual(
        state.pendingAdminWallets[0].toBase58(),
        PublicKey.default.toBase58(),
        "Pending proposal should be cleared"
      );

      console.log("✓ Admin wallet proposal cancelled successfully");
    });

    it("should fail to cancel when no proposal is pending (NoProposalPending)", async () => {
      let errorThrown = false;
      try {
        await ctx.program.methods
          .cancelAdminWalletProposal()
          .accounts({
            signer: ctx.superAdmin.publicKey,
          })
          .rpc({ skipPreflight: true });
      } catch (err: any) {
        errorThrown = true;
        console.log("✓ Correctly rejected cancel when no proposal pending");
      }

      assert.ok(errorThrown, "Should have rejected cancel when no proposal");
    });
  });
});

