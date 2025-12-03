import { PublicKey, Keypair } from "@solana/web3.js";
import assert from "assert";
import { ctx } from "./setup";

describe("multisig (update_withdraw_wallet)", () => {
  before(async () => {
    await ctx.initialize();
  });

  describe("Success Cases - Proposal Flow", () => {
    it("should allow first signer (vice_admin1) to propose new withdraw wallet", async () => {
      const tx = await ctx.program.methods
        .updateWithdrawWallet(ctx.newWithdrawWallet.publicKey)
        .accounts({
          signer: ctx.viceAdmin1.publicKey,
        })
        .signers([ctx.viceAdmin1])
        .rpc({ skipPreflight: true });

      await ctx.provider.connection.confirmTransaction(tx, "confirmed");
      console.log("Proposal tx by vice admin 1:", tx);

      const state = await ctx.fetchAdminState();
      console.log(
        "Pending withdraw wallet:",
        state.pendingWithdrawWallet.toBase58()
      );
      console.log("Approval bitmap:", state.approvalBitmap);
      console.log("Approval count: 1/3");

      assert.strictEqual(
        state.pendingWithdrawWallet.toBase58(),
        ctx.newWithdrawWallet.publicKey.toBase58(),
        "Pending wallet should be set"
      );
      assert.strictEqual(state.approvalBitmap, 2, "Bit 1 should be set"); // bit 1 = vice_admin[0]
    });

    it("should allow second signer (super_admin) to approve", async () => {
      const tx = await ctx.program.methods
        .updateWithdrawWallet(ctx.newWithdrawWallet.publicKey)
        .accounts({
          signer: ctx.superAdmin.publicKey,
        })
        .rpc({ skipPreflight: true });

      await ctx.provider.connection.confirmTransaction(tx, "confirmed");
      console.log("Approval tx by super admin:", tx);

      const state = await ctx.fetchAdminState();
      console.log("Approval bitmap:", state.approvalBitmap);
      console.log("Approval count: 2/3");

      assert.strictEqual(state.approvalBitmap, 3, "Bits 0 and 1 should be set"); // bit 0 + bit 1
    });

    it("should update withdraw wallet when threshold reached (3rd approval)", async () => {
      const stateBefore = await ctx.fetchAdminState();
      const oldWithdrawWallet = stateBefore.withdrawWallet;

      const tx = await ctx.program.methods
        .updateWithdrawWallet(ctx.newWithdrawWallet.publicKey)
        .accounts({
          signer: ctx.viceAdmin2.publicKey,
        })
        .signers([ctx.viceAdmin2])
        .rpc({ skipPreflight: true });

      await ctx.provider.connection.confirmTransaction(tx, "confirmed");
      console.log("Final approval tx by vice admin 2:", tx);

      const state = await ctx.fetchAdminState();
      console.log("Withdraw wallet after update:", state.withdrawWallet.toBase58());
      console.log(
        "Pending withdraw wallet (should be zero):",
        state.pendingWithdrawWallet.toBase58()
      );
      console.log("Approval bitmap (should be 0):", state.approvalBitmap);

      // Verify update happened
      assert.strictEqual(
        state.withdrawWallet.toBase58(),
        ctx.newWithdrawWallet.publicKey.toBase58(),
        "Withdraw wallet should be updated"
      );
      assert.strictEqual(
        state.pendingWithdrawWallet.toBase58(),
        PublicKey.default.toBase58(),
        "Pending wallet should be cleared"
      );
      assert.strictEqual(
        state.approvalBitmap,
        0,
        "Approval bitmap should be reset"
      );

      console.log("✓ Multisig threshold reached! Withdraw wallet updated.");
      console.log("  From:", oldWithdrawWallet.toBase58());
      console.log("  To:", state.withdrawWallet.toBase58());
    });
  });

  describe("Failure Cases", () => {
    it("should reject proposal from non-member (NotMultisigMember)", async () => {
      const randomUser = Keypair.generate();
      const sig = await ctx.provider.connection.requestAirdrop(
        randomUser.publicKey,
        1e9
      );
      await ctx.provider.connection.confirmTransaction(sig, "confirmed");

      let errorThrown = false;
      try {
        await ctx.program.methods
          .updateWithdrawWallet(ctx.withdrawWallet.publicKey)
          .accounts({
            signer: randomUser.publicKey,
          })
          .signers([randomUser])
          .rpc({ skipPreflight: true });
      } catch (err: any) {
        errorThrown = true;
        console.log("✓ Correctly rejected non-member proposal");
      }

      assert.ok(errorThrown, "Should have rejected non-member");
    });

    it("should reject duplicate approval from same signer (AlreadyApproved)", async () => {
      // Start a new proposal
      await ctx.program.methods
        .updateWithdrawWallet(ctx.withdrawWallet.publicKey) // Propose switching back
        .accounts({
          signer: ctx.viceAdmin1.publicKey,
        })
        .signers([ctx.viceAdmin1])
        .rpc({ skipPreflight: true });

      // Try to approve again with same signer
      let errorThrown = false;
      try {
        await ctx.program.methods
          .updateWithdrawWallet(ctx.withdrawWallet.publicKey)
          .accounts({
            signer: ctx.viceAdmin1.publicKey,
          })
          .signers([ctx.viceAdmin1])
          .rpc({ skipPreflight: true });
      } catch (err: any) {
        errorThrown = true;
        console.log("✓ Correctly rejected duplicate approval");
      }

      assert.ok(errorThrown, "Should have rejected duplicate approval");
    });

    it("should reject different proposal when one is pending (DifferentProposalPending)", async () => {
      // There's already a pending proposal for withdrawWallet
      // Try to propose a different wallet
      const anotherWallet = Keypair.generate();

      let errorThrown = false;
      try {
        await ctx.program.methods
          .updateWithdrawWallet(anotherWallet.publicKey) // Different wallet!
          .accounts({
            signer: ctx.viceAdmin2.publicKey,
          })
          .signers([ctx.viceAdmin2])
          .rpc({ skipPreflight: true });
      } catch (err: any) {
        errorThrown = true;
        console.log("✓ Correctly rejected different proposal while one pending");
      }

      assert.ok(
        errorThrown,
        "Should have rejected different proposal while one pending"
      );
    });
  });

  describe("Cancel Proposal", () => {
    it("should allow multisig member to cancel pending proposal", async () => {
      const stateBefore = await ctx.fetchAdminState();
      assert.notStrictEqual(
        stateBefore.pendingWithdrawWallet.toBase58(),
        PublicKey.default.toBase58(),
        "Should have a pending proposal"
      );

      const tx = await ctx.program.methods
        .cancelWithdrawWalletProposal()
        .accounts({
          signer: ctx.superAdmin.publicKey,
        })
        .rpc({ skipPreflight: true });

      await ctx.provider.connection.confirmTransaction(tx, "confirmed");
      console.log("Cancel proposal tx:", tx);

      const state = await ctx.fetchAdminState();
      assert.strictEqual(
        state.pendingWithdrawWallet.toBase58(),
        PublicKey.default.toBase58(),
        "Pending wallet should be cleared"
      );
      assert.strictEqual(
        state.approvalBitmap,
        0,
        "Approval bitmap should be reset"
      );

      console.log("✓ Proposal cancelled successfully");
    });

    it("should fail to cancel when no proposal pending (NoProposalPending)", async () => {
      // No pending proposal exists now
      let errorThrown = false;
      try {
        await ctx.program.methods
          .cancelWithdrawWalletProposal()
          .accounts({
            signer: ctx.superAdmin.publicKey,
          })
          .rpc({ skipPreflight: true });
      } catch (err: any) {
        errorThrown = true;
        console.log("✓ Correctly rejected cancel with no pending proposal");
      }

      assert.ok(
        errorThrown,
        "Should have rejected cancel with no pending proposal"
      );
    });

    it("should reject cancel from non-member (NotMultisigMember)", async () => {
      // First create a proposal
      await ctx.program.methods
        .updateWithdrawWallet(ctx.withdrawWallet.publicKey)
        .accounts({
          signer: ctx.viceAdmin1.publicKey,
        })
        .signers([ctx.viceAdmin1])
        .rpc({ skipPreflight: true });

      const randomUser = Keypair.generate();
      const sig = await ctx.provider.connection.requestAirdrop(
        randomUser.publicKey,
        1e9
      );
      await ctx.provider.connection.confirmTransaction(sig, "confirmed");

      let errorThrown = false;
      try {
        await ctx.program.methods
          .cancelWithdrawWalletProposal()
          .accounts({
            signer: randomUser.publicKey,
          })
          .signers([randomUser])
          .rpc({ skipPreflight: true });
      } catch (err: any) {
        errorThrown = true;
        console.log("✓ Correctly rejected cancel from non-member");
      } finally {
        // Clean up - cancel the proposal
        await ctx.program.methods
          .cancelWithdrawWalletProposal()
          .accounts({
            signer: ctx.superAdmin.publicKey,
          })
          .rpc({ skipPreflight: true });
      }

      assert.ok(errorThrown, "Should have rejected cancel from non-member");
    });
  });

  describe("Vice Admin Approval", () => {
    it("should allow vice_admin3 and vice_admin4 to participate", async () => {
      // Propose new wallet
      await ctx.program.methods
        .updateWithdrawWallet(ctx.withdrawWallet.publicKey)
        .accounts({
          signer: ctx.viceAdmin3.publicKey,
        })
        .signers([ctx.viceAdmin3])
        .rpc({ skipPreflight: true });

      let state = await ctx.fetchAdminState();
      console.log("After vice_admin3 proposal, bitmap:", state.approvalBitmap);
      // vice_admin3 is index 3 (0=super_admin, 1-4=vice_admins)
      // Bit 3 = 8

      // vice_admin4 approves
      await ctx.program.methods
        .updateWithdrawWallet(ctx.withdrawWallet.publicKey)
        .accounts({
          signer: ctx.viceAdmin4.publicKey,
        })
        .signers([ctx.viceAdmin4])
        .rpc({ skipPreflight: true });

      state = await ctx.fetchAdminState();
      console.log("After vice_admin4 approval, bitmap:", state.approvalBitmap);
      // Bit 4 = 16, so 8 + 16 = 24

      // super_admin gives final approval
      await ctx.program.methods
        .updateWithdrawWallet(ctx.withdrawWallet.publicKey)
        .accounts({
          signer: ctx.superAdmin.publicKey,
        })
        .rpc({ skipPreflight: true });

      state = await ctx.fetchAdminState();
      assert.strictEqual(
        state.withdrawWallet.toBase58(),
        ctx.withdrawWallet.publicKey.toBase58(),
        "Withdraw wallet should be updated back"
      );
      console.log("✓ Successfully switched back to original withdraw wallet via vice_admin3, vice_admin4, super_admin");
    });
  });
});
