import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { MplCoreAnchorWrapper } from "../target/types/mpl_core_anchor_wrapper";
import { ASSOCIATED_PROGRAM_ID } from "@coral-xyz/anchor/dist/cjs/utils/token";
import NodeWallet from "@coral-xyz/anchor/dist/cjs/nodewallet";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
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
    .MplCoreAnchorWrapper as Program<MplCoreAnchorWrapper>;

  const payer = provider.wallet as anchor.Wallet;

  it("Init admin!", async () => {
    let adminState = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("admin_state")],
      program.programId
    );

    try {
      let tx = await program.methods
        .initAdmin(new anchor.BN(1000))
        .accounts({
          admin: payer.publicKey,
          // adminState: adminState[0],
          // systemProgram: anchor.web3.SystemProgram.programId,
          // rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .signers([])
        .rpc({ skipPreflight: true });

      console.log("Init admin tx", tx);
      await anchor.getProvider().connection.confirmTransaction(tx, "confirmed");
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
        .updateAdminInfo(new anchor.BN(1000000))
        .accounts({
          admin: payer.publicKey,
          // adminState: adminState[0],
          newAdmin: payer.publicKey,
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

    try {
      let tx = await program.methods
        .mintNft(
          "VIERBORI",
          "VIER",
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
        })
        .signers([mint, person])
        .rpc({ skipPreflight: true });

      console.log("Mint nft tx", tx);
      await anchor.getProvider().connection.confirmTransaction(tx, "confirmed");
    } catch (err) {
      console.log(err);
    }
  });

  it("Mint new nft and burn old one!", async () => {
    let userState = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("user_state"), person.publicKey.toBuffer()],
      program.programId
    );
    const userStateAccount = await program.account.userState.fetch(
      userState[0]
    );
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

    const oldMint = userStateAccount.nftAddress;
    const oldTokenAccount = getAssociatedTokenAddressSync(
      oldMint,
      person.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );

    try {
      let tx = await program.methods
        .burnAndMintNewNft(
          "VIERBORI",
          "VIER",
          "https://arweave.net/MHK3Iopy0GgvDoM7LkkiAdg7pQqExuuWvedApCnzfj0"
        )
        .accounts({
          signer: person.publicKey,
          // systemProgram: anchor.web3.SystemProgram.programId,
          // tokenProgram: TOKEN_2022_PROGRAM_ID,
          // associatedTokenProgram: ASSOCIATED_PROGRAM_ID,
          oldMint,
          oldTokenAccount,
          tokenAccount: destinationTokenAccount,
          mint: mint.publicKey,
          // adminState: adminState[0],
          // userState: userState[0],
          admin: payer.publicKey,
          // rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .signers([mint, person])
        .rpc({ skipPreflight: true });

      console.log("Mint nft tx", tx);
      await anchor.getProvider().connection.confirmTransaction(tx, "confirmed");
    } catch (err) {
      console.log(err);
    }
  });
});
