import * as anchor from "@coral-xyz/anchor";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import assert from "assert";
import { ctx } from "./setup";

describe("init_admin", () => {
  before(async () => {
    await ctx.initialize();
  });

  describe("Success Cases", () => {
    it("should initialize admin state with correct values", async () => {
      const tx = await ctx.program.methods
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

      await ctx.provider.connection.confirmTransaction(tx, "confirmed");
      console.log("Init admin tx:", tx);

      const state = await ctx.fetchAdminState();
      console.log("Super admin:", state.superAdmin.toBase58());
      console.log("Withdraw wallet:", state.withdrawWallet.toBase58());
      console.log("Mint fee:", state.mintFee.toString());
      console.log("Max supply:", state.maxSupply.toString());
      console.log("Mint start date:", state.mintStartDate.toString());
      console.log("Payment mint:", state.paymentMint.toBase58());
      console.log("Dongle price (NFT holder):", state.donglePriceNftHolder.toString());
      console.log("Dongle price (Normal):", state.donglePriceNormal.toString());
      console.log("Purchase started:", state.purchaseStarted);

      assert.strictEqual(
        state.superAdmin.toBase58(),
        ctx.superAdmin.publicKey.toBase58(),
        "Super admin should match"
      );
      assert.strictEqual(
        state.withdrawWallet.toBase58(),
        ctx.withdrawWallet.publicKey.toBase58(),
        "Withdraw wallet should match"
      );
      assert.strictEqual(
        state.mintFee.toNumber(),
        ctx.MINT_FEE,
        "Mint fee should match"
      );
      assert.strictEqual(
        state.maxSupply.toNumber(),
        ctx.MAX_SUPPLY,
        "Max supply should match"
      );
      assert.strictEqual(
        state.mintStartDate.toNumber(),
        0,
        "Mint start date should be 0"
      );
      assert.strictEqual(
        state.paymentMint.toBase58(),
        ctx.paymentMint.toBase58(),
        "Payment mint should match"
      );
      assert.strictEqual(
        state.currentReservedCount.toNumber(),
        0,
        "Current reserved count should be 0"
      );
      assert.strictEqual(
        state.donglePriceNftHolder.toNumber(),
        ctx.DONGLE_PRICE_NFT_HOLDER,
        "Dongle price for NFT holder should match"
      );
      assert.strictEqual(
        state.donglePriceNormal.toNumber(),
        ctx.DONGLE_PRICE_NORMAL,
        "Dongle price for normal user should match"
      );
      assert.strictEqual(
        state.purchaseStarted,
        false,
        "Purchase started should be false by default"
      );
    });
  });

  describe("Failure Cases", () => {
    it("should fail to initialize admin state twice (account already exists)", async () => {
      let errorThrown = false;
      try {
        await ctx.program.methods
          .initAdmin(
            new anchor.BN(ctx.MINT_FEE),
            new anchor.BN(ctx.MAX_SUPPLY),
            ctx.withdrawWallet.publicKey,
            new anchor.BN(0),
            new anchor.BN(ctx.DONGLE_PRICE_NFT_HOLDER),
            new anchor.BN(ctx.DONGLE_PRICE_NORMAL)
          )
          .accounts({
            superAdmin: ctx.superAdmin.publicKey,
            paymentMint: ctx.paymentMint,
            paymentTokenProgram: TOKEN_PROGRAM_ID,
          })
          .rpc({ skipPreflight: true });
      } catch (err: any) {
        errorThrown = true;
        console.log("✓ Correctly rejected duplicate initialization");
      }

      assert.ok(errorThrown, "Should have rejected duplicate initialization");
    });
  });
});
