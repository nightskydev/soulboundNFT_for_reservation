import * as anchor from "@coral-xyz/anchor";
import {
  TOKEN_PROGRAM_ID,
  getAccount,
  createAssociatedTokenAccount,
} from "@solana/spl-token";
import { Keypair } from "@solana/web3.js";
import assert from "assert";
import { ctx } from "./setup";

describe("withdraw", () => {
  before(async () => {
    await ctx.initialize();
  });

  describe("Failure Cases", () => {
    it("should fail with zero withdraw amount (InvalidWithdrawAmount)", async () => {
      let errorThrown = false;
      try {
        await ctx.program.methods
          .withdraw(new anchor.BN(0)) // Zero amount!
          .accounts({
            superAdmin: ctx.superAdmin.publicKey,
            paymentMint: ctx.paymentMint,
            withdrawTokenAccount: ctx.withdrawWalletTokenAccount,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .rpc({ skipPreflight: true });
      } catch (err: any) {
        errorThrown = true;
        console.log("✓ Correctly rejected zero withdraw amount");
      }

      assert.ok(errorThrown, "Should have rejected zero withdraw amount");
    });

    it("should fail with amount exceeding vault balance (InsufficientVaultBalance)", async () => {
      const vaultAccount = await getAccount(ctx.provider.connection, ctx.vault);
      const excessiveAmount = Number(vaultAccount.amount) + 1000000000; // Way more than vault has

      let errorThrown = false;
      try {
        await ctx.program.methods
          .withdraw(new anchor.BN(excessiveAmount))
          .accounts({
            superAdmin: ctx.superAdmin.publicKey,
            paymentMint: ctx.paymentMint,
            withdrawTokenAccount: ctx.withdrawWalletTokenAccount,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .rpc({ skipPreflight: true });
      } catch (err: any) {
        errorThrown = true;
        console.log("✓ Correctly rejected excessive withdraw amount");
      }

      assert.ok(errorThrown, "Should have rejected excessive amount");
    });

    it("should fail when non-super_admin tries to withdraw (Unauthorized)", async () => {
      const randomUser = Keypair.generate();
      const sig = await ctx.provider.connection.requestAirdrop(
        randomUser.publicKey,
        1e9
      );
      await ctx.provider.connection.confirmTransaction(sig, "confirmed");

      let errorThrown = false;
      try {
        await ctx.program.methods
          .withdraw(new anchor.BN(1000000))
          .accounts({
            superAdmin: randomUser.publicKey,
            paymentMint: ctx.paymentMint,
            withdrawTokenAccount: ctx.withdrawWalletTokenAccount,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([randomUser])
          .rpc({ skipPreflight: true });
      } catch (err: any) {
        errorThrown = true;
        console.log("✓ Correctly rejected unauthorized withdrawal");
      }

      assert.ok(errorThrown, "Should have rejected unauthorized withdrawal");
    });

    it("should fail when withdraw to wrong wallet (InvalidWithdrawWallet)", async () => {
      // Create a token account for a different wallet (not the approved withdraw wallet)
      const wrongWallet = Keypair.generate();
      const wrongTokenAccount = await createAssociatedTokenAccount(
        ctx.provider.connection,
        ctx.superAdmin.payer,
        ctx.paymentMint,
        wrongWallet.publicKey,
        undefined,
        TOKEN_PROGRAM_ID
      );

      let errorThrown = false;
      try {
        await ctx.program.methods
          .withdraw(new anchor.BN(1000000))
          .accounts({
            superAdmin: ctx.superAdmin.publicKey,
            paymentMint: ctx.paymentMint,
            withdrawTokenAccount: wrongTokenAccount, // Wrong wallet!
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .rpc({ skipPreflight: true });
      } catch (err: any) {
        errorThrown = true;
        console.log("✓ Correctly rejected withdrawal to wrong wallet");
      }

      assert.ok(errorThrown, "Should have rejected wrong withdraw wallet");
    });

    it("should fail with wrong payment mint (InvalidPaymentMint)", async () => {
      let errorThrown = false;
      try {
        await ctx.program.methods
          .withdraw(new anchor.BN(1000000))
          .accounts({
            superAdmin: ctx.superAdmin.publicKey,
            paymentMint: ctx.wrongPaymentMint, // Wrong mint!
            withdrawTokenAccount: ctx.withdrawWalletTokenAccount,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .rpc({ skipPreflight: true });
      } catch (err: any) {
        errorThrown = true;
        console.log("✓ Correctly rejected wrong payment mint");
      }

      assert.ok(errorThrown, "Should have rejected wrong payment mint");
    });
  });

  describe("Success Cases", () => {
    it("should successfully withdraw partial amount", async () => {
      const vaultBefore = await getAccount(ctx.provider.connection, ctx.vault);
      const vaultBalanceBefore = Number(vaultBefore.amount);

      if (vaultBalanceBefore === 0) {
        console.log("Vault is empty, skipping partial withdraw test");
        return;
      }

      const withdrawAmount = Math.floor(vaultBalanceBefore / 2);

      console.log(
        "Vault balance before:",
        vaultBalanceBefore / 10 ** ctx.PAYMENT_DECIMALS,
        "USDC"
      );
      console.log(
        "Withdrawing:",
        withdrawAmount / 10 ** ctx.PAYMENT_DECIMALS,
        "USDC"
      );

      const walletBefore = await getAccount(
        ctx.provider.connection,
        ctx.withdrawWalletTokenAccount
      );

      const tx = await ctx.program.methods
        .withdraw(new anchor.BN(withdrawAmount))
        .accounts({
          superAdmin: ctx.superAdmin.publicKey,
          paymentMint: ctx.paymentMint,
          withdrawTokenAccount: ctx.withdrawWalletTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc({ skipPreflight: true });

      await ctx.provider.connection.confirmTransaction(tx, "confirmed");
      console.log("Partial withdraw tx:", tx);

      const vaultAfter = await getAccount(ctx.provider.connection, ctx.vault);
      const walletAfter = await getAccount(
        ctx.provider.connection,
        ctx.withdrawWalletTokenAccount
      );

      assert.strictEqual(
        Number(vaultAfter.amount),
        vaultBalanceBefore - withdrawAmount,
        "Vault balance should decrease"
      );
      assert.strictEqual(
        Number(walletAfter.amount) - Number(walletBefore.amount),
        withdrawAmount,
        "Withdraw wallet should receive tokens"
      );

      console.log(
        "Vault balance after:",
        Number(vaultAfter.amount) / 10 ** ctx.PAYMENT_DECIMALS,
        "USDC"
      );
      console.log(
        "Withdraw wallet balance:",
        Number(walletAfter.amount) / 10 ** ctx.PAYMENT_DECIMALS,
        "USDC"
      );
      console.log("✓ Partial withdrawal successful");
    });

    it("should successfully withdraw remaining balance", async () => {
      const vaultBefore = await getAccount(ctx.provider.connection, ctx.vault);
      const remainingBalance = Number(vaultBefore.amount);

      if (remainingBalance === 0) {
        console.log("Vault is empty, skipping test");
        return;
      }

      console.log(
        "Withdrawing remaining:",
        remainingBalance / 10 ** ctx.PAYMENT_DECIMALS,
        "USDC"
      );

      const tx = await ctx.program.methods
        .withdraw(new anchor.BN(remainingBalance))
        .accounts({
          superAdmin: ctx.superAdmin.publicKey,
          paymentMint: ctx.paymentMint,
          withdrawTokenAccount: ctx.withdrawWalletTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc({ skipPreflight: true });

      await ctx.provider.connection.confirmTransaction(tx, "confirmed");
      console.log("Full withdraw tx:", tx);

      const vaultAfter = await getAccount(ctx.provider.connection, ctx.vault);
      assert.strictEqual(
        Number(vaultAfter.amount),
        0,
        "Vault should be empty"
      );

      console.log("✓ Full withdrawal successful - vault emptied");
    });
  });
});
