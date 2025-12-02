import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { SoulboundNftForReservation } from "../target/types/soulbound_nft_for_reservation";
import { ASSOCIATED_PROGRAM_ID } from "@coral-xyz/anchor/dist/cjs/utils/token";
import NodeWallet from "@coral-xyz/anchor/dist/cjs/nodewallet";
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
  SystemProgram,
  Transaction,
  Connection,
  Commitment,
  SYSVAR_RENT_PUBKEY,
} from "@solana/web3.js";
import assert from "assert"

const privateKey = [
  82, 247, 200, 106, 74, 119, 140, 98, 199, 109, 171, 71, 72, 213, 247, 103,
  177, 47, 192, 114, 129, 136, 104, 240, 168, 239, 112, 195, 195, 149, 245, 130,
  182, 150, 38, 4, 144, 25, 13, 41, 87, 242, 76, 155, 13, 220, 185, 18, 234,
  137, 27, 45, 161, 88, 72, 244, 149, 243, 167, 204, 74, 151, 140, 207,
];
const adminWallet = anchor.web3.Keypair.fromSecretKey(
  Uint8Array.from(privateKey)
);

const userPrivKey = [
  13, 174, 241, 105, 110, 239, 120, 156, 225, 229, 130, 56, 108, 252, 249, 86,
  15, 136, 204, 8, 33, 109, 197, 18, 137, 104, 99, 219, 114, 75, 69, 202, 83,
  137, 128, 85, 238, 147, 245, 120, 56, 39, 15, 44, 117, 11, 134, 240, 63, 31,
  7, 160, 40, 247, 0, 234, 228, 146, 202, 161, 27, 59, 137, 42,
];

const person = anchor.web3.Keypair.fromSecretKey(Uint8Array.from(userPrivKey));

describe("extension_nft", () => {
  console.log("hehrehrehher")
  // devnet test
  // const commitment: Commitment = "confirmed";
  // const connection = new Connection(
  //   "https://holy-autumn-daylight.solana-devnet.quiknode.pro/f79aa971b5e5d9b72f0e1b55109dabed8d0b98a8/",
  //   {
  //     commitment,
  //     // wsEndpoint: "wss://api.devnet.solana.com/",
  //     confirmTransactionInitialTimeout: 60 * 10 * 1000,
  //   }
  // );

  // const options = anchor.AnchorProvider.defaultOptions();
  // const wallet = new NodeWallet(adminWallet);
  // const provider = new anchor.AnchorProvider(connection, wallet, options);

  // anchor.setProvider(provider);

  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace
    .SoulboundNftForReservation as Program<SoulboundNftForReservation>;

  const payer = provider.wallet as anchor.Wallet;

  // Payment mint (mock USDC) - will be set in beforeAll
  let paymentMint: PublicKey;
  let adminTokenAccount: PublicKey;
  let personTokenAccount: PublicKey;
  let vault: PublicKey; // PDA-controlled vault for payment tokens
  const PAYMENT_DECIMALS = 6; // USDC has 6 decimals
  const MINT_FEE = 1_000_000; // 1 USDC (in smallest units)
  const MAX_SUPPLY = 100; // Maximum number of NFTs that can be minted (0 = unlimited)

  before(async () => {
    // Create mock USDC mint
    paymentMint = await createMint(
      provider.connection,
      payer.payer,
      payer.publicKey, // mint authority
      null, // freeze authority
      PAYMENT_DECIMALS,
      undefined,
      undefined,
      TOKEN_PROGRAM_ID
    );
    console.log("Payment mint (mock USDC):", paymentMint.toBase58());

    // Derive vault PDA
    [vault] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("vault"), paymentMint.toBuffer()],
      program.programId
    );
    console.log("Vault PDA:", vault.toBase58());

    // Create admin's token account for withdrawing payments
    adminTokenAccount = await createAssociatedTokenAccount(
      provider.connection,
      payer.payer,
      paymentMint,
      payer.publicKey,
      undefined,
      TOKEN_PROGRAM_ID
    );
    console.log("Admin token account:", adminTokenAccount.toBase58());

    // Ensure person wallet has enough SOL
    const balance = await provider.connection.getBalance(person.publicKey);
    if (balance < 1e8) {
      console.log("Airdropping SOL to person...");
      const res = await provider.connection.requestAirdrop(person.publicKey, 1e9);
      await provider.connection.confirmTransaction(res, "confirmed");
    }

    // Create person's token account for payment
    personTokenAccount = await createAssociatedTokenAccount(
      provider.connection,
      payer.payer,
      paymentMint,
      person.publicKey,
      undefined,
      TOKEN_PROGRAM_ID
    );
    console.log("Person token account:", personTokenAccount.toBase58());

    // Mint some tokens to person for payment (e.g., 100 USDC)
    await mintTo(
      provider.connection,
      payer.payer,
      paymentMint,
      personTokenAccount,
      payer.publicKey,
      100 * 10 ** PAYMENT_DECIMALS,
      [],
      undefined,
      TOKEN_PROGRAM_ID
    );
    console.log("Minted 100 mock USDC to person");
  });

  it("Init admin!", async () => {
    let adminState = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("admin_state")],
      program.programId
    );

    try {
      let tx = await program.methods
        .initAdmin(new anchor.BN(MINT_FEE), new anchor.BN(MAX_SUPPLY)) // 1 USDC, max 100 NFTs
        .accounts({
          admin: payer.publicKey,
          paymentMint: paymentMint,
          // vault: vault,
          paymentTokenProgram: TOKEN_PROGRAM_ID,
          // adminState: adminState[0],
          // systemProgram: anchor.web3.SystemProgram.programId,
          // rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .signers([])
        .rpc({ skipPreflight: true });

      console.log("Init admin tx", tx);
      await anchor.getProvider().connection.confirmTransaction(tx, "confirmed");
      const adminStateAccount = await program.account.adminState.fetch(
        adminState[0]
      );
      console.log(
        "Admin state mint fee",
        adminStateAccount.mintFee.toNumber()
      );
      console.log(
        "Admin state payment mint",
        adminStateAccount.paymentMint.toBase58()
      );
      console.log(
        "Admin state max supply",
        adminStateAccount.maxSupply.toNumber()
      );
      console.log(
        "Admin state current reserved count",
        adminStateAccount.currentReservedCount.toNumber()
      );
      console.log("Vault created at:", vault.toBase58());
    } catch (err) {
      console.log(err);
    }
  });

  it("Update admin!", async () => {
    let adminState = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("admin_state")],
      program.programId
    );

    try {
      let tx = await program.methods
        .updateAdminInfo(new anchor.BN(MINT_FEE), new anchor.BN(MAX_SUPPLY)) // 1 USDC, max 100 NFTs
        .accounts({
          admin: payer.publicKey,
          // adminState: adminState[0],
          newAdmin: payer.publicKey,
          // NOTE: payment_mint cannot be changed - vault PDA depends on it
        })
        .signers([])
        .rpc({ skipPreflight: true });

      console.log("Update admin tx", tx);
      await anchor.getProvider().connection.confirmTransaction(tx, "confirmed");
    } catch (err) {
      console.log(err);
    }
  });

  it("Mint nft!", async () => {
    const balance = await anchor
      .getProvider()
      .connection.getBalance(person.publicKey);

    console.log(person.publicKey.toString(), " has ", balance);

    if (balance < 1e8) {
      console.log("Need to get airdrop sol");
      const res = await anchor
        .getProvider()
        .connection.requestAirdrop(person.publicKey, 1e9);
      await anchor
        .getProvider()
        .connection.confirmTransaction(res, "confirmed");
    }

    let mint = new Keypair();
    console.log("Mint public key", mint.publicKey.toBase58());

    const destinationTokenAccount = getAssociatedTokenAddressSync(
      mint.publicKey,
      person.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );

    let adminState = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("admin_state")],
      program.programId
    );

    let userState = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("user_state"), person.publicKey.toBuffer()],
      program.programId
    );

    // Get person's token balance before mint
    const personTokenBefore = await getAccount(provider.connection, personTokenAccount);
    console.log("Person USDC balance before mint:", Number(personTokenBefore.amount) / 10 ** PAYMENT_DECIMALS);

    // Get vault balance before mint
    const vaultBefore = await getAccount(provider.connection, vault);
    console.log("Vault USDC balance before mint:", Number(vaultBefore.amount) / 10 ** PAYMENT_DECIMALS);

    try {
      let tx = await program.methods
        .mintNft(
          "Veintree",
          "VA",
          "https://arweave.net/MHK3Iopy0GgvDoM7LkkiAdg7pQqExuuWvedApCnzfj0"
        )
        .accounts({
          signer: person.publicKey,
          // systemProgram: anchor.web3.SystemProgram.programId,
          // tokenProgram: TOKEN_2022_PROGRAM_ID,
          // associatedTokenProgram: ASSOCIATED_PROGRAM_ID,
          tokenAccount: destinationTokenAccount,
          mint: mint.publicKey,
          // adminState: adminState[0],
          // userState: userState[0],
          admin: payer.publicKey,
          // rent: anchor.web3.SYSVAR_RENT_PUBKEY,
          paymentMint: paymentMint,
          payerTokenAccount: personTokenAccount,
          // vault: vault,
          paymentTokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([mint, person])
        .rpc({ skipPreflight: true });

      console.log("Mint nft tx", tx);
      await anchor.getProvider().connection.confirmTransaction(tx, "confirmed");

      const adminStateAccount = await program.account.adminState.fetch(
        adminState[0]
      );
      console.log(
        "Admin state current reserved count",
        adminStateAccount.currentReservedCount.toNumber()
      );

      // Check token balances after mint
      const personTokenAfter = await getAccount(provider.connection, personTokenAccount);
      const vaultAfter = await getAccount(provider.connection, vault);
      console.log("Person USDC balance after mint:", Number(personTokenAfter.amount) / 10 ** PAYMENT_DECIMALS);
      console.log("Vault USDC balance after mint:", Number(vaultAfter.amount) / 10 ** PAYMENT_DECIMALS);

      await anchor.getProvider().connection.confirmTransaction(tx, "confirmed");
    } catch (err) {
      console.log(err);
    }
  });

  it("Burn nft!", async () => {
    // Use current user_state nft as the old mint to burn
    let adminState = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("admin_state")],
      program.programId
    );

    let userState = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("user_state"), person.publicKey.toBuffer()],
      program.programId
    );

    const userStateAccount = await program.account.userState.fetch(userState[0]);
    const oldMint = userStateAccount.nftAddress;

    const oldTokenAccount = getAssociatedTokenAddressSync(
      oldMint,
      person.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );

    // fetch adminState before burn
    const adminStateBefore = await program.account.adminState.fetch(adminState[0]);
    const reservedBefore = adminStateBefore.currentReservedCount.toNumber();

    try {
      // use untyped access because the generated TS types may be out-of-date
      let tx = await program.methods
        .burnNft()
        .accounts({
          signer: person.publicKey,
          oldMint,
          oldTokenAccount,
        })
        .signers([person])
        .rpc({ skipPreflight: true });

      console.log("Burn nft tx", tx);
      await anchor.getProvider().connection.confirmTransaction(tx, "confirmed");

      // fetch user state and ensure nft_address reset to default (zero pubkey)
      const updatedUserState = await program.account.userState.fetch(userState[0]);
      console.log("Updated user_state nft_address:", updatedUserState.nftAddress.toBase58());
      const zero = new PublicKey(new Uint8Array(32));
      assert.strictEqual(updatedUserState.nftAddress.toBase58(), zero.toBase58());

      // fetch adminState after burn and check currentReservedCount decreased by 1
      const adminStateAfter = await program.account.adminState.fetch(adminState[0]);
      const reservedAfter = adminStateAfter.currentReservedCount.toNumber();
      console.log(`currentReservedCount before: ${reservedBefore}, after: ${reservedAfter}`);
      assert.strictEqual(reservedAfter, reservedBefore - 1);
    } catch (err) {
      console.log(err);
    }
  });

  it("Withdraw from vault!", async () => {
    // Get vault balance before withdrawal
    const vaultBefore = await getAccount(provider.connection, vault);
    const vaultBalanceBefore = Number(vaultBefore.amount);
    console.log("Vault USDC balance before withdraw:", vaultBalanceBefore / 10 ** PAYMENT_DECIMALS);

    // Get admin token account balance before withdrawal
    const adminTokenBefore = await getAccount(provider.connection, adminTokenAccount);
    const adminBalanceBefore = Number(adminTokenBefore.amount);
    console.log("Admin USDC balance before withdraw:", adminBalanceBefore / 10 ** PAYMENT_DECIMALS);

    // Withdraw all tokens from vault
    const withdrawAmount = vaultBalanceBefore;
    console.log("Withdrawing:", withdrawAmount / 10 ** PAYMENT_DECIMALS, "USDC");

    try {
      let tx = await program.methods
        .withdraw(new anchor.BN(withdrawAmount))
        .accounts({
          admin: payer.publicKey,
          paymentMint: paymentMint,
          // vault: vault,
          adminTokenAccount: adminTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([])
        .rpc({ skipPreflight: true });

      console.log("Withdraw tx", tx);
      await anchor.getProvider().connection.confirmTransaction(tx, "confirmed");

      // Check balances after withdrawal
      const vaultAfter = await getAccount(provider.connection, vault);
      const adminTokenAfter = await getAccount(provider.connection, adminTokenAccount);
      
      console.log("Vault USDC balance after withdraw:", Number(vaultAfter.amount) / 10 ** PAYMENT_DECIMALS);
      console.log("Admin USDC balance after withdraw:", Number(adminTokenAfter.amount) / 10 ** PAYMENT_DECIMALS);

      // Verify vault is empty and admin received the tokens
      assert.strictEqual(Number(vaultAfter.amount), 0);
      assert.strictEqual(Number(adminTokenAfter.amount), adminBalanceBefore + withdrawAmount);
    } catch (err) {
      console.log(err);
    }
  });
});
