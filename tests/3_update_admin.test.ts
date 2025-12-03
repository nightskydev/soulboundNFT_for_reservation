import * as anchor from "@coral-xyz/anchor";
import { Keypair } from "@solana/web3.js";
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
        .updateMintFee(new anchor.BN(newMintFee))
        .accounts({
          superAdmin: ctx.superAdmin.publicKey,
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
        .updateMaxSupply(new anchor.BN(newMaxSupply))
        .accounts({
          superAdmin: ctx.superAdmin.publicKey,
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
        .updateMaxSupply(new anchor.BN(ctx.MAX_SUPPLY))
        .accounts({
          superAdmin: ctx.superAdmin.publicKey,
        })
        .rpc({ skipPreflight: true });
    });

    it("should update mint_start_date", async () => {
      const futureTimestamp = Math.floor(Date.now() / 1000) + 3600;

      const tx = await ctx.program.methods
        .updateMintStartDate(new anchor.BN(futureTimestamp))
        .accounts({
          superAdmin: ctx.superAdmin.publicKey,
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
        .updateMintStartDate(new anchor.BN(0))
        .accounts({
          superAdmin: ctx.superAdmin.publicKey,
        })
        .rpc({ skipPreflight: true });
    });

    it("should update dongle price for NFT holders", async () => {
      const newDonglePriceNftHolder = 50_000_000; // 50 USDC

      const tx = await ctx.program.methods
        .updateDonglePriceNftHolder(new anchor.BN(newDonglePriceNftHolder))
        .accounts({
          superAdmin: ctx.superAdmin.publicKey,
        })
        .rpc({ skipPreflight: true });

      await ctx.provider.connection.confirmTransaction(tx, "confirmed");

      const state = await ctx.fetchAdminState();
      assert.strictEqual(
        state.donglePriceNftHolder.toNumber(),
        newDonglePriceNftHolder,
        "Dongle price for NFT holder should be updated"
      );
      console.log("✓ Dongle price for NFT holders updated to:", newDonglePriceNftHolder);

      // Restore original value
      await ctx.program.methods
        .updateDonglePriceNftHolder(new anchor.BN(ctx.DONGLE_PRICE_NFT_HOLDER))
        .accounts({
          superAdmin: ctx.superAdmin.publicKey,
        })
        .rpc({ skipPreflight: true });
    });

    it("should update dongle price for normal users", async () => {
      const newDonglePriceNormal = 250_000_000; // 250 USDC

      const tx = await ctx.program.methods
        .updateDonglePriceNormal(new anchor.BN(newDonglePriceNormal))
        .accounts({
          superAdmin: ctx.superAdmin.publicKey,
        })
        .rpc({ skipPreflight: true });

      await ctx.provider.connection.confirmTransaction(tx, "confirmed");

      const state = await ctx.fetchAdminState();
      assert.strictEqual(
        state.donglePriceNormal.toNumber(),
        newDonglePriceNormal,
        "Dongle price for normal user should be updated"
      );
      console.log("✓ Dongle price for normal users updated to:", newDonglePriceNormal);

      // Restore original value
      await ctx.program.methods
        .updateDonglePriceNormal(new anchor.BN(ctx.DONGLE_PRICE_NORMAL))
        .accounts({
          superAdmin: ctx.superAdmin.publicKey,
        })
        .rpc({ skipPreflight: true });
    });

    it("should update purchase_started flag", async () => {
      // Enable purchase
      const tx = await ctx.program.methods
        .updatePurchaseStarted(true)
        .accounts({
          superAdmin: ctx.superAdmin.publicKey,
        })
        .rpc({ skipPreflight: true });

      await ctx.provider.connection.confirmTransaction(tx, "confirmed");

      let state = await ctx.fetchAdminState();
      assert.strictEqual(
        state.purchaseStarted,
        true,
        "Purchase started should be true"
      );
      console.log("✓ Purchase started set to true");

      // Disable purchase
      await ctx.program.methods
        .updatePurchaseStarted(false)
        .accounts({
          superAdmin: ctx.superAdmin.publicKey,
        })
        .rpc({ skipPreflight: true });

      state = await ctx.fetchAdminState();
      assert.strictEqual(
        state.purchaseStarted,
        false,
        "Purchase started should be false"
      );
      console.log("✓ Purchase started set to false");
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
          .updateMintFee(new anchor.BN(ctx.MINT_FEE))
          .accounts({
            superAdmin: randomUser.publicKey,
          })
          .signers([randomUser])
          .rpc({ skipPreflight: true });
      } catch (err: any) {
        errorThrown = true;
        console.log("✓ Correctly rejected unauthorized admin update");
      }

      assert.ok(errorThrown, "Should have rejected unauthorized update");
    });
  });
});
