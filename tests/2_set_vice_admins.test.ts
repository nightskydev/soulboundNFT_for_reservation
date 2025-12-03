import { Keypair, PublicKey } from "@solana/web3.js";
import assert from "assert";
import { ctx } from "./setup";

describe("set_vice_admins", () => {
  before(async () => {
    await ctx.initialize();
  });

  describe("Success Cases", () => {
    it("should set vice admins (super_admin only)", async () => {
      const viceAdmins: [PublicKey, PublicKey, PublicKey, PublicKey] = [
        ctx.viceAdmin1.publicKey,
        ctx.viceAdmin2.publicKey,
        ctx.viceAdmin3.publicKey,
        ctx.viceAdmin4.publicKey,
      ];

      const tx = await ctx.program.methods
        .setViceAdmins(viceAdmins)
        .accounts({
          superAdmin: ctx.superAdmin.publicKey,
        })
        .rpc({ skipPreflight: true });

      await ctx.provider.connection.confirmTransaction(tx, "confirmed");
      console.log("Set vice admins tx:", tx);

      const state = await ctx.fetchAdminState();
      console.log("Vice admins set:");
      state.viceAdmins.forEach((va, i) => {
        console.log(`  ${i + 1}: ${va.toBase58()}`);
        assert.strictEqual(
          va.toBase58(),
          viceAdmins[i].toBase58(),
          `Vice admin ${i + 1} should match`
        );
      });
    });

    it("should allow setting some vice admins as empty (default pubkey)", async () => {
      const viceAdmins: [PublicKey, PublicKey, PublicKey, PublicKey] = [
        ctx.viceAdmin1.publicKey,
        ctx.viceAdmin2.publicKey,
        PublicKey.default, // Empty slot
        PublicKey.default, // Empty slot
      ];

      const tx = await ctx.program.methods
        .setViceAdmins(viceAdmins)
        .accounts({
          superAdmin: ctx.superAdmin.publicKey,
        })
        .rpc({ skipPreflight: true });

      await ctx.provider.connection.confirmTransaction(tx, "confirmed");
      console.log("✓ Set vice admins with empty slots");

      // Restore all 4 vice admins for subsequent tests
      const fullViceAdmins: [PublicKey, PublicKey, PublicKey, PublicKey] = [
        ctx.viceAdmin1.publicKey,
        ctx.viceAdmin2.publicKey,
        ctx.viceAdmin3.publicKey,
        ctx.viceAdmin4.publicKey,
      ];

      await ctx.program.methods
        .setViceAdmins(fullViceAdmins)
        .accounts({
          superAdmin: ctx.superAdmin.publicKey,
        })
        .rpc({ skipPreflight: true });
    });
  });

  describe("Failure Cases", () => {
    it("should fail when non-super_admin tries to set vice admins (Unauthorized)", async () => {
      const randomUser = Keypair.generate();
      const sig = await ctx.provider.connection.requestAirdrop(
        randomUser.publicKey,
        1e9
      );
      await ctx.provider.connection.confirmTransaction(sig, "confirmed");

      const viceAdmins: [PublicKey, PublicKey, PublicKey, PublicKey] = [
        ctx.viceAdmin1.publicKey,
        ctx.viceAdmin2.publicKey,
        ctx.viceAdmin3.publicKey,
        ctx.viceAdmin4.publicKey,
      ];

      let errorThrown = false;
      try {
        await ctx.program.methods
          .setViceAdmins(viceAdmins)
          .accounts({
            superAdmin: randomUser.publicKey,
          })
          .signers([randomUser])
          .rpc({ skipPreflight: true });
      } catch (err: any) {
        errorThrown = true;
        console.log("✓ Correctly rejected unauthorized vice admin update");
      }

      assert.ok(errorThrown, "Should have rejected unauthorized update");
    });

    it("should fail when vice admin is same as super admin (InvalidViceAdmin)", async () => {
      const viceAdmins: [PublicKey, PublicKey, PublicKey, PublicKey] = [
        ctx.superAdmin.publicKey, // Same as super_admin - should fail!
        ctx.viceAdmin2.publicKey,
        ctx.viceAdmin3.publicKey,
        ctx.viceAdmin4.publicKey,
      ];

      let errorThrown = false;
      try {
        await ctx.program.methods
          .setViceAdmins(viceAdmins)
          .accounts({
            superAdmin: ctx.superAdmin.publicKey,
          })
          .rpc({ skipPreflight: true });
      } catch (err: any) {
        errorThrown = true;
        console.log("✓ Correctly rejected vice admin same as super admin");
      }

      assert.ok(
        errorThrown,
        "Should have rejected vice admin same as super admin"
      );
    });

    it("should fail with duplicate vice admin addresses (DuplicateViceAdmin)", async () => {
      const viceAdmins: [PublicKey, PublicKey, PublicKey, PublicKey] = [
        ctx.viceAdmin1.publicKey,
        ctx.viceAdmin1.publicKey, // Duplicate!
        ctx.viceAdmin3.publicKey,
        ctx.viceAdmin4.publicKey,
      ];

      let errorThrown = false;
      try {
        await ctx.program.methods
          .setViceAdmins(viceAdmins)
          .accounts({
            superAdmin: ctx.superAdmin.publicKey,
          })
          .rpc({ skipPreflight: true });
      } catch (err: any) {
        errorThrown = true;
        console.log("✓ Correctly rejected duplicate vice admin");
      }

      assert.ok(errorThrown, "Should have rejected duplicate vice admin");
    });
  });
});
