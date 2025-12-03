import * as anchor from "@coral-xyz/anchor";
import { Keypair, SystemProgram } from "@solana/web3.js";
import assert from "assert";
import { ctx } from "./setup";

describe("update_admin", () => {
  before(async () => {
    await ctx.initialize();
  });

  describe("Success Cases", () => {
    it("should update mint_fee", async () => {
      const newMintFee = ctx.MINT_FEE * 2;

      const tx = await ctx.program.methods
        .updateAdminInfo(
          new anchor.BN(newMintFee),
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

      await ctx.provider.connection.confirmTransaction(tx, "confirmed");
      console.log("Update mint_fee tx:", tx);

      const state = await ctx.fetchAdminState();
      assert.strictEqual(
        state.mintFee.toNumber(),
        newMintFee,
        "Mint fee should be updated"
      );
      console.log("✓ Mint fee updated to:", state.mintFee.toString());
    });

    it("should update max_supply", async () => {
      const newMaxSupply = 200;

      const tx = await ctx.program.methods
        .updateAdminInfo(
          new anchor.BN(ctx.MINT_FEE * 2),
          new anchor.BN(newMaxSupply),
          new anchor.BN(0),
          new anchor.BN(ctx.DONGLE_PRICE_NFT_HOLDER),
          new anchor.BN(ctx.DONGLE_PRICE_NORMAL)
        )
        .accounts({
          superAdmin: ctx.superAdmin.publicKey,
          newSuperAdmin: ctx.superAdmin.publicKey,
        })
        .rpc({ skipPreflight: true });

      await ctx.provider.connection.confirmTransaction(tx, "confirmed");

      const state = await ctx.fetchAdminState();
      assert.strictEqual(
        state.maxSupply.toNumber(),
        newMaxSupply,
        "Max supply should be updated"
      );
      console.log("✓ Max supply updated to:", state.maxSupply.toString());

      // Restore original values
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
    });

    it("should update mint_start_date", async () => {
      const futureTimestamp = Math.floor(Date.now() / 1000) + 3600;

      const tx = await ctx.program.methods
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

      await ctx.provider.connection.confirmTransaction(tx, "confirmed");

      const state = await ctx.fetchAdminState();
      assert.strictEqual(
        state.mintStartDate.toNumber(),
        futureTimestamp,
        "Mint start date should be updated"
      );
      console.log(
        "✓ Mint start date updated to:",
        new Date(state.mintStartDate.toNumber() * 1000).toISOString()
      );

      // Reset to 0 for subsequent tests
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
    });

    it("should update dongle prices", async () => {
      const newDonglePriceNftHolder = 50_000_000; // 50 USDC
      const newDonglePriceNormal = 250_000_000; // 250 USDC

      const tx = await ctx.program.methods
        .updateAdminInfo(
          new anchor.BN(ctx.MINT_FEE * 2),
          new anchor.BN(ctx.MAX_SUPPLY),
          new anchor.BN(0),
          new anchor.BN(newDonglePriceNftHolder),
          new anchor.BN(newDonglePriceNormal)
        )
        .accounts({
          superAdmin: ctx.superAdmin.publicKey,
          newSuperAdmin: ctx.superAdmin.publicKey,
        })
        .rpc({ skipPreflight: true });

      await ctx.provider.connection.confirmTransaction(tx, "confirmed");

      const state = await ctx.fetchAdminState();
      assert.strictEqual(
        state.donglePriceNftHolder.toNumber(),
        newDonglePriceNftHolder,
        "Dongle price for NFT holder should be updated"
      );
      assert.strictEqual(
        state.donglePriceNormal.toNumber(),
        newDonglePriceNormal,
        "Dongle price for normal user should be updated"
      );
      console.log("✓ Dongle prices updated - NFT holder:", newDonglePriceNftHolder, ", Normal:", newDonglePriceNormal);

      // Restore original values
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
    });

    it("should transfer super_admin to new address", async () => {
      const newSuperAdmin = Keypair.generate();
      const sig = await ctx.provider.connection.requestAirdrop(
        newSuperAdmin.publicKey,
        1e9
      );
      await ctx.provider.connection.confirmTransaction(sig, "confirmed");

      // Transfer to new admin
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
          newSuperAdmin: newSuperAdmin.publicKey,
        })
        .rpc({ skipPreflight: true });

      let state = await ctx.fetchAdminState();
      assert.strictEqual(
        state.superAdmin.toBase58(),
        newSuperAdmin.publicKey.toBase58(),
        "Super admin should be transferred"
      );
      console.log("✓ Super admin transferred to:", newSuperAdmin.publicKey.toBase58());

      // Transfer back to original
      await ctx.program.methods
        .updateAdminInfo(
          new anchor.BN(ctx.MINT_FEE * 2),
          new anchor.BN(ctx.MAX_SUPPLY),
          new anchor.BN(0),
          new anchor.BN(ctx.DONGLE_PRICE_NFT_HOLDER),
          new anchor.BN(ctx.DONGLE_PRICE_NORMAL)
        )
        .accounts({
          superAdmin: newSuperAdmin.publicKey,
          newSuperAdmin: ctx.superAdmin.publicKey,
        })
        .signers([newSuperAdmin])
        .rpc({ skipPreflight: true });

      state = await ctx.fetchAdminState();
      assert.strictEqual(
        state.superAdmin.toBase58(),
        ctx.superAdmin.publicKey.toBase58(),
        "Super admin should be restored"
      );
      console.log("✓ Super admin restored");
    });
  });

  describe("Failure Cases", () => {
    it("should fail when non-super_admin tries to update (Unauthorized)", async () => {
      const randomUser = Keypair.generate();
      const sig = await ctx.provider.connection.requestAirdrop(
        randomUser.publicKey,
        1e9
      );
      await ctx.provider.connection.confirmTransaction(sig, "confirmed");

      let errorThrown = false;
      try {
        await ctx.program.methods
          .updateAdminInfo(
            new anchor.BN(ctx.MINT_FEE),
            new anchor.BN(ctx.MAX_SUPPLY),
            new anchor.BN(0),
            new anchor.BN(ctx.DONGLE_PRICE_NFT_HOLDER),
            new anchor.BN(ctx.DONGLE_PRICE_NORMAL)
          )
          .accounts({
            superAdmin: randomUser.publicKey,
            newSuperAdmin: randomUser.publicKey,
          })
          .signers([randomUser])
          .rpc({ skipPreflight: true });
      } catch (err: any) {
        errorThrown = true;
        console.log("✓ Correctly rejected unauthorized admin update");
      }

      assert.ok(errorThrown, "Should have rejected unauthorized update");
    });

    it("should fail when new_super_admin is system program (InvalidAdminAccount)", async () => {
      let errorThrown = false;
      try {
        await ctx.program.methods
          .updateAdminInfo(
            new anchor.BN(ctx.MINT_FEE),
            new anchor.BN(ctx.MAX_SUPPLY),
            new anchor.BN(0),
            new anchor.BN(ctx.DONGLE_PRICE_NFT_HOLDER),
            new anchor.BN(ctx.DONGLE_PRICE_NORMAL)
          )
          .accounts({
            superAdmin: ctx.superAdmin.publicKey,
            newSuperAdmin: SystemProgram.programId, // System program - invalid!
          })
          .rpc({ skipPreflight: true });
      } catch (err: any) {
        errorThrown = true;
        console.log("✓ Correctly rejected system program as new super admin");
      }

      assert.ok(
        errorThrown,
        "Should have rejected system program as new super admin"
      );
    });
  });
});
