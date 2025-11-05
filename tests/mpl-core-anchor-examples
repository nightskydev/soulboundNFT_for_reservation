import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { MplCoreAnchorWrapper } from "../target/types/mpl_core_anchor_wrapper";
import {
  createInitializeMintInstruction,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import * as assert from "assert";
import {
  createV1,
  createV2,
  mplCore,
  execute,
  fetchAssetV1,
  transferV1,
  fetchAsset,
  fetchCollection,
  createCollectionV1,
  createCollectionV2,
  getAssetV1GpaBuilder,
  findAssetSignerPda,
  MPL_CORE_PROGRAM_ID,
  Key,
  collectionAddress,
  updateAuthority,
  pluginAuthorityPair,
  ruleSet,
} from "@metaplex-foundation/mpl-core";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import {
  TransactionBuilderSendAndConfirmOptions,
  generateSigner,
  signerIdentity,
  keypairIdentity,
  createNoopSigner,
  sol,
  publicKey,
} from "@metaplex-foundation/umi";

// Helpers
function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("mpl-core-anchor-examples", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace
    .MplCoreAnchorWrapper as Program<MplCoreAnchorWrapper>;

  // it("Initializes admin state", async () => {
  //   const provider = anchor.AnchorProvider.env();
  //   anchor.setProvider(provider);
  //   // Generate keypairs
  //   const mint = anchor.web3.Keypair.generate();
  //   const treasury = anchor.web3.Keypair.generate();

  //   // Derive PDAs
  //   const [vaultPda, _] = anchor.web3.PublicKey.findProgramAddressSync(
  //     [Buffer.from("vault")],
  //     program.programId
  //   );
  //   const [adminStatePda] = anchor.web3.PublicKey.findProgramAddressSync(
  //     [Buffer.from("state"), Buffer.from("admin")],
  //     program.programId
  //   );

  //   // Airdrop SOL to payer and treasury
  //   const connection = provider.connection;
  //   const payer = provider.wallet.publicKey;
  //   // await connection.requestAirdrop(payer, 2 * anchor.web3.LAMPORTS_PER_SOL);
  //   // await connection.requestAirdrop(
  //   //   treasury.publicKey,
  //   //   anchor.web3.LAMPORTS_PER_SOL
  //   // );

  //   // Create mint account
  //   const mintRent = await connection.getMinimumBalanceForRentExemption(82);
  //   const createMintIx = anchor.web3.SystemProgram.createAccount({
  //     fromPubkey: payer,
  //     newAccountPubkey: mint.publicKey,
  //     space: 82,
  //     lamports: mintRent,
  //     programId: TOKEN_PROGRAM_ID,
  //   });
  //   const initMintIx = createInitializeMintInstruction(
  //     mint.publicKey,
  //     0,
  //     payer,
  //     null
  //   );
  //   const txMint = new anchor.web3.Transaction().add(createMintIx, initMintIx);
  //   await provider.sendAndConfirm(txMint, [mint]);

  //   // Call initializeAdmin
  //   await program.methods
  //     .initializeAdmin({
  //       riskBasedApy: [1, 2, 3], // Example APY values
  //       stakingPeriodRange: [
  //         new anchor.BN(60 * 60 * 24),
  //         new anchor.BN(60 * 60 * 24 * 30),
  //       ], // 1 day to 30 days
  //       withdrawAvailableAfter: new anchor.BN(60 * 60 * 24 * 7), // 7 days
  //     })
  //     .accountsPartial({
  //       mint: mint.publicKey,
  //       vault: vaultPda,
  //       adminState: adminStatePda,
  //       treasury: treasury.publicKey,
  //       systemProgram: anchor.web3.SystemProgram.programId,
  //       tokenProgram: TOKEN_PROGRAM_ID,
  //     })
  //     .signers([])
  //     .rpc();

  //   // Fetch and check AdminState
  //   const adminState = await program.account.adminState.fetch(adminStatePda);
  //   assert.deepEqual(adminState.riskBasedApy, [1, 2, 3]);
  //   assert.deepEqual(
  //     adminState.stakingPeriodRange.map((x: anchor.BN) => x.toNumber()),
  //     [60 * 60 * 24, 60 * 60 * 24 * 30]
  //   );
  //   assert.equal(
  //     adminState.withdrawAvailableAfter.toNumber(),
  //     60 * 60 * 24 * 7
  //   );
  //   assert.ok(adminState.tokenMint.equals(mint.publicKey));
  //   assert.ok(adminState.admin.equals(payer));
  //   assert.ok(adminState.treasury.equals(treasury.publicKey));
  //   console.log("AdminState:", adminState);
  // });

  // it("Can create an Asset", async () => {
  //   const asset = anchor.web3.Keypair.generate();
  //   // Add your test here.
  //   const tx = await program.methods
  //     .createV1({
  //       name: "Hello Anchor!",
  //       uri: "www.example.com",
  //       plugins: null,
  //     })
  //     .accounts({
  //       asset: asset.publicKey,
  //       collection: null,
  //       payer: anchor.getProvider().publicKey,
  //       owner: null,
  //       updateAuthority: null,
  //       logWrapper: null,
  //     })
  //     .signers([asset])
  //     .rpc();
  //   console.log("Your transaction signature", tx);
  // });

  it("Can create an Asset with Vault PDA & Staking test", async () => {
    const umi = createUmi(
      "https://stylish-thrilling-model.solana-devnet.quiknode.pro/4c04763b7094cc438662f16acda78bc32df10f00",
      // "http://127.0.0.1:8899",
      "processed"
    ).use(mplCore());

    // const asset = generateSigner(umi);
    const asset = anchor.web3.Keypair.generate();
    const treasury = new anchor.web3.PublicKey(
      "kVnzBpks8vo2cMqoRaiyq8ZvENMua9BZWZyxkUCEJnj"
    );
    // find asset signer PDA
    const assetSignerPda = findAssetSignerPda(umi, {
      asset: publicKey(asset.publicKey.toString()),
    });

    // Get balances before
    const connection = anchor.getProvider().connection;
    const payer = anchor.getProvider().publicKey;
    const assetSignerPubkey = new anchor.web3.PublicKey(
      assetSignerPda[0].toString()
    );
    const payerBalanceBefore = await connection.getBalance(payer);
    console.log("Payer balance before:", payer, payerBalanceBefore);

    const lamportsToSend = 1_000_000;

    const assetSignerBalanceBefore = await connection.getBalance(
      assetSignerPubkey
    );

    // const treasuryAirdropSig = await connection.requestAirdrop(
    //   treasury,
    //   1_000_000_000 // 1 SOL
    // );
    // await connection.confirmTransaction(treasuryAirdropSig, "confirmed");

    // create collection
    // const collection = anchor.web3.Keypair.generate();
    // // Add your test here.
    // const createCollectionTx = await program.methods
    //   .createCollectionV1({
    //     name: "Sirius Collection",
    //     uri: "www.example.com",
    //     plugins: [],
    //   })
    //   .accounts({
    //     collection: collection.publicKey,
    //     payer: anchor.getProvider().publicKey,
    //     updateAuthority: null,
    //   })
    //   .signers([collection])
    //   .rpc();
    // console.log("Collection address is ", collection.publicKey.toString());
    // console.log("Your transaction signature", createCollectionTx);

    // Add your test here.
    const tx = await program.methods
      .createV1WithVaultPda({
        name: "Hello Anchor!",
        uri: "https://arweave.net/JqFHoOxGvoeXCXqgSNtSLI4xw5hVruidRfBSZE1Jvvo/29.json",
        plugins: null,
        lamports: new anchor.BN(lamportsToSend),
        nftType: 1, // 1 = 4% fee, 0 = 5% fee
      })
      .accounts({
        asset: asset.publicKey,
        // collection: collection.publicKey,
        collection: publicKey("7WTUogkFRHrvpy8x3gZeqLeBTfRtmxofPvtgALQPRei9"),
        assetSigner: assetSignerPubkey,
        payer: anchor.getProvider().publicKey,
        owner: null,
        updateAuthority: null,
        treasury: treasury,
        logWrapper: null,
      })
      .signers([asset])
      .rpc();
    console.log("asset publickey ", asset.publicKey.toString());

    // Get balances after
    const payerBalanceAfter = await connection.getBalance(payer);
    const assetSignerBalanceAfter = await connection.getBalance(
      assetSignerPubkey
    );

    // Check the difference
    console.log("Payer diff:", payerBalanceBefore - payerBalanceAfter);
    console.log(
      "Asset signer diff:",
      assetSignerBalanceAfter - assetSignerBalanceBefore
    );

    if (assetSignerBalanceAfter - assetSignerBalanceBefore !== lamportsToSend) {
      throw new Error(
        "SOL was not transferred correctly to the asset signer PDA"
      );
    }

    console.log("Your transaction signature", tx);

    // await wait(5000);
    // staking test
    const stakingTx = await program.methods
      .stake({
        stakingPeriod: new anchor.BN(8640000),
        riskType: 0,
      })
      .accountsPartial({
        owner: anchor.getProvider().publicKey,
        updateAuthority: anchor.getProvider().publicKey,
        payer: anchor.getProvider().publicKey,
        asset: asset.publicKey,
        // collection: collection.publicKey,
        collection: publicKey("7WTUogkFRHrvpy8x3gZeqLeBTfRtmxofPvtgALQPRei9"),
        coreProgram: MPL_CORE_PROGRAM_ID,
      })
      .signers([])
      .rpc();

    console.log(stakingTx);

    const assetInfo = await fetchAsset(umi, asset.publicKey.toString());
    // console.log("Asset:", assetInfo);

    // Attributes are usually stored in plugins, so:
    console.log("Attributes:", assetInfo.attributes);
  });

  // it("Can create a Collection", async () => {
  //   const collection = anchor.web3.Keypair.generate();
  //   // Add your test here.
  //   const tx = await program.methods
  //     .createCollectionV1({
  //       name: "Hello Anchor!",
  //       uri: "www.example.com",
  //       plugins: [],
  //     })
  //     .accounts({
  //       collection: collection.publicKey,
  //       payer: anchor.getProvider().publicKey,
  //       updateAuthority: null,
  //     })
  //     .signers([collection])
  //     .rpc();
  //   console.log("Your transaction signature", tx);
  // });

  // it("Can transfer an Asset", async () => {
  //   const asset = anchor.web3.Keypair.generate();
  //   // Add your test here.
  //   await program.methods
  //     .createV1({
  //       name: "Hello Anchor!",
  //       uri: "www.example.com",
  //       plugins: null,
  //     })
  //     .accounts({
  //       asset: asset.publicKey,
  //       collection: null,
  //       payer: anchor.getProvider().publicKey,
  //       owner: null,
  //       updateAuthority: null,
  //       logWrapper: null,
  //     })
  //     .signers([asset])
  //     .rpc();

  //   const tx = await program.methods
  //     .transferV1({})
  //     .accounts({
  //       asset: asset.publicKey,
  //       collection: null,
  //       payer: anchor.getProvider().publicKey,
  //       newOwner: anchor.web3.Keypair.generate().publicKey,
  //       systemProgram: null,
  //       logWrapper: null,
  //     })
  //     .rpc();
  //   console.log("Your transaction signature", tx);
  // });
});
