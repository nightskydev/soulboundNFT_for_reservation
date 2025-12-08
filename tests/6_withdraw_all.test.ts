import * as anchor from "@coral-xyz/anchor";
import {
  TOKEN_PROGRAM_ID,
  getAccount,
  createAssociatedTokenAccount,
  createTransferInstruction,
} from "@solana/spl-token";
import { Keypair, Transaction } from "@solana/web3.js";
import assert from "assert";
import { ctx } from "./setup";

describe("withdraw_all", () => {
  before(async () => {
    await ctx.initialize();
  });

  describe("Failure Cases", () => {
    it("should fail when vault is empty (InsufficientVaultBalance)", async () => {
      // First, ensure vault is empty by withdrawing all if needed
      const vaultCheck = await getAccount(ctx.provider.connection, ctx.vault);
      if (Number(vaultCheck.amount) > 0) {
        // Withdraw all to make vault empty
        await ctx.program.methods
          .withdrawAll()
          .accounts({
            superAdmin: ctx.superAdmin.publicKey,
            paymentMint: ctx.paymentMint,
            withdrawTokenAccount: ctx.withdrawWalletTokenAccount,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .rpc({ skipPreflight: true });
      }

      let errorThrown = false;
      try {
        await ctx.program.methods
          .withdrawAll()
          .accounts({
            superAdmin: ctx.superAdmin.publicKey,
            paymentMint: ctx.paymentMint,
            withdrawTokenAccount: ctx.withdrawWalletTokenAccount,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .rpc({ skipPreflight: true });
      } catch (err: any) {
        errorThrown = true;
        console.log("✓ Correctly rejected withdrawal from empty vault");
      }

      assert.ok(errorThrown, "Should have rejected withdrawal from empty vault");
    });

    it("should fail when non-super_admin tries to withdraw_all (Unauthorized)", async () => {
      // First, add some funds to vault for testing by transferring from user account
      const testAmount = 10_000_000; // 10 USDC
      const transferIx = createTransferInstruction(
        ctx.userTokenAccount,
        ctx.vault,
        ctx.user.publicKey,
        testAmount,
        [],
        TOKEN_PROGRAM_ID
      );
      const tx = new Transaction().add(transferIx);
      await ctx.provider.sendAndConfirm(tx, [ctx.user]);

      const randomUser = Keypair.generate();
      const sig = await ctx.provider.connection.requestAirdrop(
        randomUser.publicKey,
        1e9
      );
      await ctx.provider.connection.confirmTransaction(sig, "confirmed");

      let errorThrown = false;
      try {
        await ctx.program.methods
          .withdrawAll()
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
        console.log("✓ Correctly rejected unauthorized withdraw_all");
      }

      assert.ok(
        errorThrown,
        "Should have rejected unauthorized withdraw_all"
      );
    });

    it("should fail when withdraw_all to wrong wallet (InvalidWithdrawWallet)", async () => {
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
          .withdrawAll()
          .accounts({
            superAdmin: ctx.superAdmin.publicKey,
            paymentMint: ctx.paymentMint,
            withdrawTokenAccount: wrongTokenAccount, // Wrong wallet!
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .rpc({ skipPreflight: true });
      } catch (err: any) {
        errorThrown = true;
        console.log("✓ Correctly rejected withdraw_all to wrong wallet");
      }

      assert.ok(
        errorThrown,
        "Should have rejected wrong withdraw wallet"
      );
    });

    it("should fail with wrong payment mint (InvalidPaymentMint)", async () => {
      let errorThrown = false;
      try {
        await ctx.program.methods
          .withdrawAll()
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
    it("should successfully withdraw_all funds from vault", async () => {
      // First, ensure vault has some funds
      const vaultBefore = await getAccount(ctx.provider.connection, ctx.vault);
      let vaultBalanceBefore = Number(vaultBefore.amount);

      // If vault is empty, add some funds for testing by transferring from user account
      if (vaultBalanceBefore === 0) {
        const testAmount = 50_000_000; // 50 USDC
        const transferIx = createTransferInstruction(
          ctx.userTokenAccount,
          ctx.vault,
          ctx.user.publicKey,
          testAmount,
          [],
          TOKEN_PROGRAM_ID
        );
        const tx = new Transaction().add(transferIx);
        await ctx.provider.sendAndConfirm(tx, [ctx.user]);
        vaultBalanceBefore = testAmount;
      }

      console.log(
        "Vault balance before:",
        vaultBalanceBefore / 10 ** ctx.PAYMENT_DECIMALS,
        "USDC"
      );

      const walletBefore = await getAccount(
        ctx.provider.connection,
        ctx.withdrawWalletTokenAccount
      );
      const walletBalanceBefore = Number(walletBefore.amount);

      const tx = await ctx.program.methods
        .withdrawAll()
        .accounts({
          superAdmin: ctx.superAdmin.publicKey,
          paymentMint: ctx.paymentMint,
          withdrawTokenAccount: ctx.withdrawWalletTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc({ skipPreflight: true });

      await ctx.provider.connection.confirmTransaction(tx, "confirmed");
      console.log("Withdraw all tx:", tx);

      const vaultAfter = await getAccount(ctx.provider.connection, ctx.vault);
      const walletAfter = await getAccount(
        ctx.provider.connection,
        ctx.withdrawWalletTokenAccount
      );

      // Verify vault is empty
      assert.strictEqual(
        Number(vaultAfter.amount),
        0,
        "Vault should be empty after withdraw_all"
      );

      // Verify withdraw wallet received all funds
      assert.strictEqual(
        Number(walletAfter.amount) - walletBalanceBefore,
        vaultBalanceBefore,
        "Withdraw wallet should receive all tokens"
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
      console.log("✓ Withdraw all successful - vault emptied");
    });

    it("should successfully withdraw_all multiple times if funds are added", async () => {
      // Add funds to vault by transferring from user account
      const testAmount = 25_000_000; // 25 USDC
      const transferIx = createTransferInstruction(
        ctx.userTokenAccount,
        ctx.vault,
        ctx.user.publicKey,
        testAmount,
        [],
        TOKEN_PROGRAM_ID
      );
      const tx = new Transaction().add(transferIx);
      await ctx.provider.sendAndConfirm(tx, [ctx.user]);

      const vaultBefore = await getAccount(ctx.provider.connection, ctx.vault);
      const vaultBalanceBefore = Number(vaultBefore.amount);

      const walletBefore = await getAccount(
        ctx.provider.connection,
        ctx.withdrawWalletTokenAccount
      );
      const walletBalanceBefore = Number(walletBefore.amount);

      // First withdraw_all
      const tx1 = await ctx.program.methods
        .withdrawAll()
        .accounts({
          superAdmin: ctx.superAdmin.publicKey,
          paymentMint: ctx.paymentMint,
          withdrawTokenAccount: ctx.withdrawWalletTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc({ skipPreflight: true });

      await ctx.provider.connection.confirmTransaction(tx1, "confirmed");

      // Verify vault is empty
      const vaultAfter1 = await getAccount(ctx.provider.connection, ctx.vault);
      assert.strictEqual(
        Number(vaultAfter1.amount),
        0,
        "Vault should be empty after first withdraw_all"
      );

      // Add more funds by transferring from user account
      const testAmount2 = 15_000_000; // 15 USDC
      const transferIx2 = createTransferInstruction(
        ctx.userTokenAccount,
        ctx.vault,
        ctx.user.publicKey,
        testAmount2,
        [],
        TOKEN_PROGRAM_ID
      );
      const transferTx2 = new Transaction().add(transferIx2);
      await ctx.provider.sendAndConfirm(transferTx2, [ctx.user]);

      // Second withdraw_all
      const tx2 = await ctx.program.methods
        .withdrawAll()
        .accounts({
          superAdmin: ctx.superAdmin.publicKey,
          paymentMint: ctx.paymentMint,
          withdrawTokenAccount: ctx.withdrawWalletTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc({ skipPreflight: true });

      await ctx.provider.connection.confirmTransaction(tx2, "confirmed");

      // Verify vault is empty again
      const vaultAfter2 = await getAccount(ctx.provider.connection, ctx.vault);
      assert.strictEqual(
        Number(vaultAfter2.amount),
        0,
        "Vault should be empty after second withdraw_all"
      );

      // Verify total withdrawal
      const walletAfter = await getAccount(
        ctx.provider.connection,
        ctx.withdrawWalletTokenAccount
      );
      assert.strictEqual(
        Number(walletAfter.amount) - walletBalanceBefore,
        vaultBalanceBefore + testAmount2,
        "Withdraw wallet should receive all tokens from both withdrawals"
      );

      console.log("✓ Multiple withdraw_all operations successful");
    });
  });
});

