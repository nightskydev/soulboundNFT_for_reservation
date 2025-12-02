import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { SoulboundNftForReservation } from "../target/types/soulbound_nft_for_reservation";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createMint,
  createAssociatedTokenAccount,
  mintTo,
  getAccount,
} from "@solana/spl-token";
import {
  Keypair,
  PublicKey,
} from "@solana/web3.js";
import assert from "assert";

describe("soulbound_nft_multisig", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace
    .SoulboundNftForReservation as Program<SoulboundNftForReservation>;

  const superAdmin = provider.wallet as anchor.Wallet;

  // Create 4 vice admins for multisig
  const viceAdmin1 = Keypair.generate();
  const viceAdmin2 = Keypair.generate();
  const viceAdmin3 = Keypair.generate();
  const viceAdmin4 = Keypair.generate();

  // Withdraw wallet and new withdraw wallet for testing
  const withdrawWallet = Keypair.generate();
  const newWithdrawWallet = Keypair.generate();

  // User for minting
  const user = Keypair.generate();

  // Payment related
  let paymentMint: PublicKey;
  let userTokenAccount: PublicKey;
  let withdrawWalletTokenAccount: PublicKey;
  let newWithdrawWalletTokenAccount: PublicKey;
  let vault: PublicKey;
  
  const PAYMENT_DECIMALS = 6;
  const MINT_FEE = 1_000_000; // 1 USDC
  const MAX_SUPPLY = 100;

  before(async () => {
    console.log("\n=== Setting up Multisig Test ===\n");

    // Create mock USDC mint
    paymentMint = await createMint(
      provider.connection,
      superAdmin.payer,
      superAdmin.publicKey,
      null,
      PAYMENT_DECIMALS,
      undefined,
      undefined,
      TOKEN_PROGRAM_ID
    );
    console.log("Payment mint:", paymentMint.toBase58());

    // Derive vault PDA
    [vault] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("vault"), paymentMint.toBuffer()],
      program.programId
    );
    console.log("Vault PDA:", vault.toBase58());

    // Create withdraw wallet token accounts
    withdrawWalletTokenAccount = await createAssociatedTokenAccount(
      provider.connection,
      superAdmin.payer,
      paymentMint,
      withdrawWallet.publicKey,
      undefined,
      TOKEN_PROGRAM_ID
    );

    newWithdrawWalletTokenAccount = await createAssociatedTokenAccount(
      provider.connection,
      superAdmin.payer,
      paymentMint,
      newWithdrawWallet.publicKey,
      undefined,
      TOKEN_PROGRAM_ID
    );

    // Airdrop SOL to user and vice admins
    const airdropTargets = [user, viceAdmin1, viceAdmin2, viceAdmin3, viceAdmin4];
    for (const target of airdropTargets) {
      const sig = await provider.connection.requestAirdrop(target.publicKey, 2e9);
      await provider.connection.confirmTransaction(sig, "confirmed");
    }

    // Create user's token account and mint USDC
    userTokenAccount = await createAssociatedTokenAccount(
      provider.connection,
      superAdmin.payer,
      paymentMint,
      user.publicKey,
      undefined,
      TOKEN_PROGRAM_ID
    );

    await mintTo(
      provider.connection,
      superAdmin.payer,
      paymentMint,
      userTokenAccount,
      superAdmin.publicKey,
      100 * 10 ** PAYMENT_DECIMALS,
      [],
      undefined,
      TOKEN_PROGRAM_ID
    );

    console.log("Super admin:", superAdmin.publicKey.toBase58());
    console.log("Vice admin 1:", viceAdmin1.publicKey.toBase58());
    console.log("Vice admin 2:", viceAdmin2.publicKey.toBase58());
    console.log("Vice admin 3:", viceAdmin3.publicKey.toBase58());
    console.log("Vice admin 4:", viceAdmin4.publicKey.toBase58());
    console.log("Withdraw wallet:", withdrawWallet.publicKey.toBase58());
    console.log("New withdraw wallet:", newWithdrawWallet.publicKey.toBase58());
  });

  it("1. Init admin with super_admin", async () => {
    const tx = await program.methods
      .initAdmin(
        new anchor.BN(MINT_FEE),
        new anchor.BN(MAX_SUPPLY),
        withdrawWallet.publicKey
      )
      .accounts({
        superAdmin: superAdmin.publicKey,
        paymentMint: paymentMint,
        paymentTokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc({ skipPreflight: true });

    await provider.connection.confirmTransaction(tx, "confirmed");
    console.log("Init admin tx:", tx);

    const [adminState] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("admin_state")],
      program.programId
    );

    const state = await program.account.adminState.fetch(adminState);
    console.log("Super admin:", state.superAdmin.toBase58());
    console.log("Withdraw wallet:", state.withdrawWallet.toBase58());
    
    assert.strictEqual(state.superAdmin.toBase58(), superAdmin.publicKey.toBase58());
    assert.strictEqual(state.withdrawWallet.toBase58(), withdrawWallet.publicKey.toBase58());
  });

  it("2. Set vice admins (super_admin only)", async () => {
    const viceAdmins: [PublicKey, PublicKey, PublicKey, PublicKey] = [
      viceAdmin1.publicKey,
      viceAdmin2.publicKey,
      viceAdmin3.publicKey,
      viceAdmin4.publicKey,
    ];

    const tx = await program.methods
      .setViceAdmins(viceAdmins)
      .accounts({
        superAdmin: superAdmin.publicKey,
      })
      .rpc({ skipPreflight: true });

    await provider.connection.confirmTransaction(tx, "confirmed");
    console.log("Set vice admins tx:", tx);

    const [adminState] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("admin_state")],
      program.programId
    );

    const state = await program.account.adminState.fetch(adminState);
    console.log("Vice admins set:");
    state.viceAdmins.forEach((va, i) => {
      console.log(`  ${i + 1}: ${va.toBase58()}`);
    });
  });

  it("3. Update admin info (super_admin only)", async () => {
    const tx = await program.methods
      .updateAdminInfo(
        new anchor.BN(MINT_FEE * 2), // Double the fee
        new anchor.BN(MAX_SUPPLY)
      )
      .accounts({
        superAdmin: superAdmin.publicKey,
        newSuperAdmin: superAdmin.publicKey, // Keep same super admin
      })
      .rpc({ skipPreflight: true });

    await provider.connection.confirmTransaction(tx, "confirmed");
    console.log("Update admin tx:", tx);
  });

  it("4. Mint NFT", async () => {
    const mint = Keypair.generate();
    const tokenAccount = getAssociatedTokenAddressSync(
      mint.publicKey,
      user.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );

    const tx = await program.methods
      .mintNft("Test NFT", "TEST", "https://example.com/nft")
      .accounts({
        signer: user.publicKey,
        tokenAccount: tokenAccount,
        mint: mint.publicKey,
        superAdmin: superAdmin.publicKey,
        paymentMint: paymentMint,
        payerTokenAccount: userTokenAccount,
        paymentTokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([mint, user])
      .rpc({ skipPreflight: true });

    await provider.connection.confirmTransaction(tx, "confirmed");
    console.log("Mint NFT tx:", tx);

    const vaultAccount = await getAccount(provider.connection, vault);
    console.log("Vault balance after mint:", Number(vaultAccount.amount) / 10 ** PAYMENT_DECIMALS, "USDC");
  });

  it("5. Multisig: First signer proposes new withdraw wallet", async () => {
    // Vice admin 1 proposes
    const tx = await program.methods
      .updateWithdrawWallet(newWithdrawWallet.publicKey)
      .accounts({
        signer: viceAdmin1.publicKey,
      })
      .signers([viceAdmin1])
      .rpc({ skipPreflight: true });

    await provider.connection.confirmTransaction(tx, "confirmed");
    console.log("Proposal tx by vice admin 1:", tx);

    const [adminState] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("admin_state")],
      program.programId
    );

    const state = await program.account.adminState.fetch(adminState);
    console.log("Pending withdraw wallet:", state.pendingWithdrawWallet.toBase58());
    console.log("Approval bitmap:", state.approvalBitmap);
    console.log("Approval count: 1/3");

    assert.strictEqual(state.pendingWithdrawWallet.toBase58(), newWithdrawWallet.publicKey.toBase58());
    assert.strictEqual(state.approvalBitmap, 2); // bit 1 = vice_admin[0]
  });

  it("6. Multisig: Second signer approves", async () => {
    // Super admin approves
    const tx = await program.methods
      .updateWithdrawWallet(newWithdrawWallet.publicKey)
      .accounts({
        signer: superAdmin.publicKey,
      })
      .rpc({ skipPreflight: true });

    await provider.connection.confirmTransaction(tx, "confirmed");
    console.log("Approval tx by super admin:", tx);

    const [adminState] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("admin_state")],
      program.programId
    );

    const state = await program.account.adminState.fetch(adminState);
    console.log("Approval bitmap:", state.approvalBitmap);
    console.log("Approval count: 2/3");

    assert.strictEqual(state.approvalBitmap, 3); // bit 0 + bit 1
  });

  it("7. Multisig: Third signer approves - threshold reached!", async () => {
    // Vice admin 2 approves - this should trigger the update
    const tx = await program.methods
      .updateWithdrawWallet(newWithdrawWallet.publicKey)
      .accounts({
        signer: viceAdmin2.publicKey,
      })
      .signers([viceAdmin2])
      .rpc({ skipPreflight: true });

    await provider.connection.confirmTransaction(tx, "confirmed");
    console.log("Final approval tx by vice admin 2:", tx);

    const [adminState] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("admin_state")],
      program.programId
    );

    const state = await program.account.adminState.fetch(adminState);
    console.log("Withdraw wallet after update:", state.withdrawWallet.toBase58());
    console.log("Pending withdraw wallet (should be zero):", state.pendingWithdrawWallet.toBase58());
    console.log("Approval bitmap (should be 0):", state.approvalBitmap);

    // Verify update happened
    assert.strictEqual(state.withdrawWallet.toBase58(), newWithdrawWallet.publicKey.toBase58());
    assert.strictEqual(state.pendingWithdrawWallet.toBase58(), PublicKey.default.toBase58());
    assert.strictEqual(state.approvalBitmap, 0);

    console.log("✓ Multisig threshold reached! Withdraw wallet updated.");
  });

  it("8. Withdraw to new withdraw wallet", async () => {
    const vaultBefore = await getAccount(provider.connection, vault);
    const withdrawAmount = Number(vaultBefore.amount);
    console.log("Vault balance:", withdrawAmount / 10 ** PAYMENT_DECIMALS, "USDC");

    const tx = await program.methods
      .withdraw(new anchor.BN(withdrawAmount))
      .accounts({
        superAdmin: superAdmin.publicKey,
        paymentMint: paymentMint,
        withdrawTokenAccount: newWithdrawWalletTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc({ skipPreflight: true });

    await provider.connection.confirmTransaction(tx, "confirmed");
    console.log("Withdraw tx:", tx);

    const newWalletBalance = await getAccount(provider.connection, newWithdrawWalletTokenAccount);
    console.log("New withdraw wallet balance:", Number(newWalletBalance.amount) / 10 ** PAYMENT_DECIMALS, "USDC");

    console.log("✓ Successfully withdrew to new multisig-approved wallet!");
  });

  it("9. Test: Cannot approve same proposal twice", async () => {
    // Start a new proposal
    await program.methods
      .updateWithdrawWallet(withdrawWallet.publicKey) // Propose switching back
      .accounts({
        signer: viceAdmin1.publicKey,
      })
      .signers([viceAdmin1])
      .rpc({ skipPreflight: true });

    // Try to approve again with same signer
    let errorThrown = false;
    try {
      await program.methods
        .updateWithdrawWallet(withdrawWallet.publicKey)
        .accounts({
          signer: viceAdmin1.publicKey,
        })
        .signers([viceAdmin1])
        .rpc({ skipPreflight: true });
    } catch (err) {
      errorThrown = true;
      console.log("✓ Correctly rejected duplicate approval");
    }

    assert.ok(errorThrown, "Should have rejected duplicate approval");
  });

  it("10. Test: Cancel pending proposal", async () => {
    const tx = await program.methods
      .cancelWithdrawWalletProposal()
      .accounts({
        signer: superAdmin.publicKey,
      })
      .rpc({ skipPreflight: true });

    await provider.connection.confirmTransaction(tx, "confirmed");
    console.log("Cancel proposal tx:", tx);

    const [adminState] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("admin_state")],
      program.programId
    );

    const state = await program.account.adminState.fetch(adminState);
    assert.strictEqual(state.pendingWithdrawWallet.toBase58(), PublicKey.default.toBase58());
    assert.strictEqual(state.approvalBitmap, 0);

    console.log("✓ Proposal cancelled successfully");
  });

  it("11. Test: Non-member cannot propose", async () => {
    const randomUser = Keypair.generate();
    const sig = await provider.connection.requestAirdrop(randomUser.publicKey, 1e9);
    await provider.connection.confirmTransaction(sig, "confirmed");

    let errorThrown = false;
    try {
      await program.methods
        .updateWithdrawWallet(withdrawWallet.publicKey)
        .accounts({
          signer: randomUser.publicKey,
        })
        .signers([randomUser])
        .rpc({ skipPreflight: true });
    } catch (err) {
      errorThrown = true;
      console.log("✓ Correctly rejected non-member proposal");
    }

    assert.ok(errorThrown, "Should have rejected non-member");
  });
});
