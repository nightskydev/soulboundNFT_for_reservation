import * as anchor from "@coral-xyz/anchor";
import {
  TOKEN_PROGRAM_ID,
  getAccount,
  createMint,
  mintTo,
} from "@solana/spl-token";
import { Keypair, PublicKey } from "@solana/web3.js";
import assert from "assert";
import { ctx } from "./setup";

describe("update_payment_mint", () => {
  let newPaymentMint: PublicKey;
  let newVault: PublicKey;
  let anotherPaymentMint: PublicKey;

  before(async () => {
    await ctx.initialize();

    // Create a new payment mint for testing
    newPaymentMint = await createMint(
      ctx.provider.connection,
      ctx.superAdmin.payer,
      ctx.superAdmin.publicKey,
      null,
      ctx.PAYMENT_DECIMALS,
      undefined,
      undefined,
      TOKEN_PROGRAM_ID
    );
    console.log("New payment mint created:", newPaymentMint.toBase58());

    // Derive the new vault PDA
    [newVault] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("vault"), newPaymentMint.toBuffer()],
      ctx.program.programId
    );
    console.log("New vault PDA:", newVault.toBase58());

    // Create another payment mint for additional tests
    anotherPaymentMint = await createMint(
      ctx.provider.connection,
      ctx.superAdmin.payer,
      ctx.superAdmin.publicKey,
      null,
      ctx.PAYMENT_DECIMALS,
      undefined,
      undefined,
      TOKEN_PROGRAM_ID
    );
    console.log("Another payment mint created:", anotherPaymentMint.toBase58());
  });

  describe("Failure Cases", () => {
    it("should fail when vault is not empty (VaultNotEmpty)", async () => {
      // First, check if vault has any balance
      const vaultAccount = await getAccount(ctx.provider.connection, ctx.vault);
      
      if (Number(vaultAccount.amount) === 0) {
        // Fund the vault directly by minting to it
        console.log("Vault is empty, funding it for the test...");

        await mintTo(
          ctx.provider.connection,
          ctx.superAdmin.payer,
          ctx.paymentMint,
          ctx.vault, // Mint directly to vault for testing
          ctx.superAdmin.publicKey,
          1_000_000, // 1 USDC
          [],
          undefined,
          TOKEN_PROGRAM_ID
        );
        console.log("Funded vault with 1 USDC for testing");
      }

      // Verify vault has balance
      const vaultAfterFunding = await getAccount(ctx.provider.connection, ctx.vault);
      console.log("Vault balance:", Number(vaultAfterFunding.amount) / 10 ** ctx.PAYMENT_DECIMALS, "USDC");

      let errorThrown = false;
      try {
        await ctx.program.methods
          .updatePaymentMint()
          .accounts({
            superAdmin: ctx.superAdmin.publicKey,
            oldVault: ctx.vault,
            newPaymentMint: newPaymentMint,
            newPaymentTokenProgram: TOKEN_PROGRAM_ID,
          })
          .rpc({ skipPreflight: true });
      } catch (err: any) {
        errorThrown = true;
        console.log("✓ Correctly rejected: Vault not empty");
        // VaultNotEmpty error - check for error message or code
        const errString = err.toString();
        assert.ok(
          errString.includes("VaultNotEmpty") || 
          errString.includes("6020") ||
          errString.includes("Vault must be empty"),
          `Should be VaultNotEmpty error, got: ${errString}`
        );
      }

      assert.ok(errorThrown, "Should have rejected due to non-empty vault");
    });

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
          .updatePaymentMint()
          .accounts({
            superAdmin: randomUser.publicKey,
            oldVault: ctx.vault,
            newPaymentMint: newPaymentMint,
            newPaymentTokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([randomUser])
          .rpc({ skipPreflight: true });
      } catch (err: any) {
        errorThrown = true;
        console.log("✓ Correctly rejected unauthorized payment mint update");
      }

      assert.ok(errorThrown, "Should have rejected unauthorized update");
    });
  });

  describe("Success Cases", () => {
    before(async () => {
      // Empty the vault before success tests
      const vaultAccount = await getAccount(ctx.provider.connection, ctx.vault);
      const vaultBalance = Number(vaultAccount.amount);

      if (vaultBalance > 0) {
        console.log("\nEmptying vault before update_payment_mint test...");
        console.log("Current vault balance:", vaultBalance / 10 ** ctx.PAYMENT_DECIMALS, "USDC");

        await ctx.program.methods
          .withdraw(new anchor.BN(vaultBalance))
          .accounts({
            superAdmin: ctx.superAdmin.publicKey,
            paymentMint: ctx.paymentMint,
            withdrawTokenAccount: ctx.withdrawWalletTokenAccount,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .rpc({ skipPreflight: true });

        console.log("✓ Vault emptied successfully");
      }
    });

    it("should successfully update payment mint when vault is empty", async () => {
      // Verify vault is empty
      const vaultBefore = await getAccount(ctx.provider.connection, ctx.vault);
      assert.strictEqual(
        Number(vaultBefore.amount),
        0,
        "Vault should be empty before update"
      );

      const stateBefore = await ctx.fetchAdminState();
      console.log("\nBefore update:");
      console.log("  Current payment mint:", stateBefore.paymentMint.toBase58());
      console.log("  New payment mint:", newPaymentMint.toBase58());

      const tx = await ctx.program.methods
        .updatePaymentMint()
        .accounts({
          superAdmin: ctx.superAdmin.publicKey,
          oldVault: ctx.vault,
          newPaymentMint: newPaymentMint,
          newPaymentTokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc({ skipPreflight: true });

      await ctx.provider.connection.confirmTransaction(tx, "confirmed");
      console.log("\nUpdate payment mint tx:", tx);

      const stateAfter = await ctx.fetchAdminState();
      assert.strictEqual(
        stateAfter.paymentMint.toBase58(),
        newPaymentMint.toBase58(),
        "Payment mint should be updated"
      );

      console.log("\nAfter update:");
      console.log("  Payment mint:", stateAfter.paymentMint.toBase58());
      console.log("✓ Payment mint updated successfully");

      // Verify new vault was created
      const newVaultAccount = await getAccount(ctx.provider.connection, newVault);
      console.log("  New vault created:", newVault.toBase58());
      console.log("  New vault balance:", Number(newVaultAccount.amount));
    });

    it("should fail when trying to update to same payment mint (SamePaymentMint)", async () => {
      // Try to update to the same mint that's currently set
      const currentState = await ctx.fetchAdminState();
      
      let errorThrown = false;
      try {
        // Derive old vault for the current payment mint
        const [currentVault] = await anchor.web3.PublicKey.findProgramAddress(
          [Buffer.from("vault"), currentState.paymentMint.toBuffer()],
          ctx.program.programId
        );

        await ctx.program.methods
          .updatePaymentMint()
          .accounts({
            superAdmin: ctx.superAdmin.publicKey,
            oldVault: currentVault,
            newPaymentMint: currentState.paymentMint, // Same mint!
            newPaymentTokenProgram: TOKEN_PROGRAM_ID,
          })
          .rpc({ skipPreflight: true });
      } catch (err: any) {
        errorThrown = true;
        console.log("✓ Correctly rejected: Same payment mint");
      }

      assert.ok(errorThrown, "Should have rejected same payment mint");
    });

    it("should be able to update payment mint again", async () => {
      // Get current state
      const stateBefore = await ctx.fetchAdminState();
      
      // Derive old vault (now pointing to newPaymentMint)
      const [currentVault] = await anchor.web3.PublicKey.findProgramAddress(
        [Buffer.from("vault"), stateBefore.paymentMint.toBuffer()],
        ctx.program.programId
      );

      // Verify current vault is empty
      const vaultBefore = await getAccount(ctx.provider.connection, currentVault);
      assert.strictEqual(
        Number(vaultBefore.amount),
        0,
        "Current vault should be empty"
      );

      console.log("\nUpdating to another payment mint...");
      console.log("  From:", stateBefore.paymentMint.toBase58());
      console.log("  To:", anotherPaymentMint.toBase58());

      const tx = await ctx.program.methods
        .updatePaymentMint()
        .accounts({
          superAdmin: ctx.superAdmin.publicKey,
          oldVault: currentVault,
          newPaymentMint: anotherPaymentMint,
          newPaymentTokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc({ skipPreflight: true });

      await ctx.provider.connection.confirmTransaction(tx, "confirmed");
      console.log("Update payment mint tx:", tx);

      const stateAfter = await ctx.fetchAdminState();
      assert.strictEqual(
        stateAfter.paymentMint.toBase58(),
        anotherPaymentMint.toBase58(),
        "Payment mint should be updated to another mint"
      );

      console.log("✓ Payment mint updated to another mint successfully");
    });
  });

  describe("Restore original payment mint", () => {
    it("should restore original payment mint for other tests", async () => {
      const stateBefore = await ctx.fetchAdminState();
      
      // Derive current vault
      const [currentVault] = await anchor.web3.PublicKey.findProgramAddress(
        [Buffer.from("vault"), stateBefore.paymentMint.toBuffer()],
        ctx.program.programId
      );

      console.log("\nRestoring original payment mint...");
      console.log("  From:", stateBefore.paymentMint.toBase58());
      console.log("  To:", ctx.paymentMint.toBase58());

      const tx = await ctx.program.methods
        .updatePaymentMint()
        .accounts({
          superAdmin: ctx.superAdmin.publicKey,
          oldVault: currentVault,
          newPaymentMint: ctx.paymentMint,
          newPaymentTokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc({ skipPreflight: true });

      await ctx.provider.connection.confirmTransaction(tx, "confirmed");

      const stateAfter = await ctx.fetchAdminState();
      assert.strictEqual(
        stateAfter.paymentMint.toBase58(),
        ctx.paymentMint.toBase58(),
        "Payment mint should be restored to original"
      );

      console.log("✓ Original payment mint restored");
    });
  });
});
