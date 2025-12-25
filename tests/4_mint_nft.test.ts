import * as anchor from "@coral-xyz/anchor";
import { expect } from "chai";
import { testContext, initializeTestContext, MINT_FEE, MAX_SUPPLY, MINT_START_DATE, DONGLE_PRICE_NFT_HOLDER, DONGLE_PRICE_NORMAL } from "./setup";
import { Keypair, PublicKey, ComputeBudgetProgram } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync, mintTo, getAccount } from "@solana/spl-token";

const METAPLEX_PROGRAM_ID = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");
const SYSVAR_INSTRUCTIONS_PUBKEY = new PublicKey("Sysvar1nstructions1111111111111111111111111");

describe("mint_nft", () => {
  let user1NftMint: Keypair;

  before(async () => {
    await initializeTestContext();

    // Initialize admin if not already done
    if (!testContext.adminInitialized) {
      await testContext.program.methods
        .initAdmin(
          MINT_FEE,
          MAX_SUPPLY,
          testContext.withdrawWallet.publicKey,
          MINT_START_DATE,
          DONGLE_PRICE_NFT_HOLDER,
          DONGLE_PRICE_NORMAL
        )
        .accounts({
          superAdmin: testContext.admin.publicKey,
          paymentMint: testContext.usdcMint,
          paymentTokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([testContext.admin])
        .rpc();
      testContext.adminInitialized = true;
    }

    // Update mint fee to a smaller amount for testing (1 USDC)
    await testContext.program.methods
      .updateMintFee(new anchor.BN(1_000_000))
      .accounts({
        superAdmin: testContext.admin.publicKey,
      })
      .signers([testContext.admin])
      .rpc();

    // Fund user1 with USDC for minting
    await mintTo(
      testContext.provider.connection,
      testContext.admin,
      testContext.usdcMint,
      testContext.user1.tokenAccount,
      testContext.admin,
      10_000_000 // 10 USDC
    );
  });

  it("should mint NFT successfully without collection", async () => {
    user1NftMint = Keypair.generate();
    
    const nftTokenAccount = getAssociatedTokenAddressSync(
      user1NftMint.publicKey,
      testContext.user1.keypair.publicKey
    );

    // Derive metadata PDA
    const [metadataAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from("metadata"), METAPLEX_PROGRAM_ID.toBuffer(), user1NftMint.publicKey.toBuffer()],
      METAPLEX_PROGRAM_ID
    );

    // Add compute budget for Metaplex operations
    const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({
      units: 400_000,
    });

    // Get vault balance before
    const vaultBalanceBefore = await testContext.getVaultBalance();

    await testContext.program.methods
      .mintNft("Test NFT", "TNFT", "https://example.com/nft-metadata.json")
      .accounts({
        signer: testContext.user1.keypair.publicKey,
        tokenAccount: nftTokenAccount,
        mint: user1NftMint.publicKey,
        tokenMetadataProgram: METAPLEX_PROGRAM_ID,
        metadataAccount: metadataAccount,
        paymentMint: testContext.usdcMint,
        payerTokenAccount: testContext.user1.tokenAccount,
        paymentTokenProgram: TOKEN_PROGRAM_ID,
        collectionMint: null,
        collectionMetadata: null,
        collectionMasterEdition: null,
        sysvarInstructions: null,
      })
      .preInstructions([modifyComputeUnits])
      .signers([testContext.user1.keypair, user1NftMint])
      .rpc();

    // Verify NFT token account has 1 token
    const tokenAccountInfo = await getAccount(testContext.provider.connection, nftTokenAccount);
    expect(Number(tokenAccountInfo.amount)).to.equal(1);

    // Verify vault received payment
    const vaultBalanceAfter = await testContext.getVaultBalance();
    expect(Number(vaultBalanceAfter - vaultBalanceBefore)).to.equal(1_000_000);

    // Verify admin state reserved count increased
    const adminState = await testContext.fetchAdminState();
    expect(adminState.currentReservedCount.toNumber()).to.be.greaterThan(0);
  });

  it("should mint NFT successfully with OG collection", async () => {
    // First create an OG collection if not exists
    if (!testContext.ogCollectionMint) {
      const ogCollectionMint = Keypair.generate();
      
      const collectionTokenAccount = getAssociatedTokenAddressSync(
        ogCollectionMint.publicKey,
        testContext.adminStatePda,
        true
      );

      const [metadataAccount] = PublicKey.findProgramAddressSync(
        [Buffer.from("metadata"), METAPLEX_PROGRAM_ID.toBuffer(), ogCollectionMint.publicKey.toBuffer()],
        METAPLEX_PROGRAM_ID
      );
      
      const [masterEditionAccount] = PublicKey.findProgramAddressSync(
        [Buffer.from("metadata"), METAPLEX_PROGRAM_ID.toBuffer(), ogCollectionMint.publicKey.toBuffer(), Buffer.from("edition")],
        METAPLEX_PROGRAM_ID
      );

      const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({
        units: 400_000,
      });

      await testContext.program.methods
        .createCollectionNft("OG Collection", "OG", "https://example.com/og.json")
        .accounts({
          signer: testContext.admin.publicKey,
          collectionMint: ogCollectionMint.publicKey,
          collectionTokenAccount: collectionTokenAccount,
          metadataAccount: metadataAccount,
          masterEditionAccount: masterEditionAccount,
        })
        .preInstructions([modifyComputeUnits])
        .signers([testContext.admin, ogCollectionMint])
        .rpc();

      testContext.ogCollectionMint = ogCollectionMint.publicKey;

      // Update admin state with OG collection
      await testContext.program.methods
        .updateOgCollection(ogCollectionMint.publicKey)
        .accounts({
          superAdmin: testContext.admin.publicKey,
        })
        .signers([testContext.admin])
        .rpc();
    }

    // Use user2 for this test (user1 already has an NFT)
    const user2NftMint = Keypair.generate();
    
    const nftTokenAccount = getAssociatedTokenAddressSync(
      user2NftMint.publicKey,
      testContext.user2.keypair.publicKey
    );

    // Derive metadata PDA
    const [user2MetadataAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from("metadata"), METAPLEX_PROGRAM_ID.toBuffer(), user2NftMint.publicKey.toBuffer()],
      METAPLEX_PROGRAM_ID
    );

    // Fund user2 with USDC
    await mintTo(
      testContext.provider.connection,
      testContext.admin,
      testContext.usdcMint,
      testContext.user2.tokenAccount,
      testContext.admin,
      10_000_000
    );

    const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({
      units: 400_000,
    });

    // Derive collection metadata and master edition PDAs
    const [collectionMetadataAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from("metadata"), METAPLEX_PROGRAM_ID.toBuffer(), testContext.ogCollectionMint!.toBuffer()],
      METAPLEX_PROGRAM_ID
    );
    const [collectionMasterEditionAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from("metadata"), METAPLEX_PROGRAM_ID.toBuffer(), testContext.ogCollectionMint!.toBuffer(), Buffer.from("edition")],
      METAPLEX_PROGRAM_ID
    );

    await testContext.program.methods
      .mintNft("OG NFT", "OGNFT", "https://example.com/og-nft.json")
      .accounts({
        signer: testContext.user2.keypair.publicKey,
        tokenAccount: nftTokenAccount,
        mint: user2NftMint.publicKey,
        tokenMetadataProgram: METAPLEX_PROGRAM_ID,
        metadataAccount: user2MetadataAccount,
        paymentMint: testContext.usdcMint,
        payerTokenAccount: testContext.user2.tokenAccount,
        paymentTokenProgram: TOKEN_PROGRAM_ID,
        collectionMint: testContext.ogCollectionMint,
        collectionMetadata: collectionMetadataAccount,
        collectionMasterEdition: collectionMasterEditionAccount,
        sysvarInstructions: SYSVAR_INSTRUCTIONS_PUBKEY,
      })
      .preInstructions([modifyComputeUnits])
      .signers([testContext.user2.keypair, user2NftMint])
      .rpc();

    // Verify NFT was minted successfully
    const tokenAccountInfo = await getAccount(testContext.provider.connection, nftTokenAccount);
    expect(Number(tokenAccountInfo.amount)).to.equal(1);
  });

  it("should allow user to mint multiple NFTs", async () => {
    const secondMint = Keypair.generate();
    
    const nftTokenAccount = getAssociatedTokenAddressSync(
      secondMint.publicKey,
      testContext.user1.keypair.publicKey
    );

    // Derive metadata PDA
    const [metadataAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from("metadata"), METAPLEX_PROGRAM_ID.toBuffer(), secondMint.publicKey.toBuffer()],
      METAPLEX_PROGRAM_ID
    );

    const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({
      units: 400_000,
    });

    const reservedCountBefore = (await testContext.fetchAdminState()).currentReservedCount.toNumber();

    await testContext.program.methods
      .mintNft("Second NFT", "SNFT", "https://example.com/second.json")
      .accounts({
        signer: testContext.user1.keypair.publicKey,
        tokenAccount: nftTokenAccount,
        mint: secondMint.publicKey,
        tokenMetadataProgram: METAPLEX_PROGRAM_ID,
        metadataAccount: metadataAccount,
        paymentMint: testContext.usdcMint,
        payerTokenAccount: testContext.user1.tokenAccount,
        paymentTokenProgram: TOKEN_PROGRAM_ID,
        collectionMint: null,
        collectionMetadata: null,
        collectionMasterEdition: null,
      })
      .preInstructions([modifyComputeUnits])
      .signers([testContext.user1.keypair, secondMint])
      .rpc();
    
    // Verify second NFT was minted
    const tokenAccountInfo = await getAccount(testContext.provider.connection, nftTokenAccount);
    expect(Number(tokenAccountInfo.amount)).to.equal(1);

    // Verify reserved count increased
    const reservedCountAfter = (await testContext.fetchAdminState()).currentReservedCount.toNumber();
    expect(reservedCountAfter).to.equal(reservedCountBefore + 1);
  });

  it("should verify metadata PDA derivation", async () => {
    const mint = Keypair.generate();
    const [metadataPda] = testContext.getMetadataPda(mint.publicKey);
    expect(metadataPda.toString()).to.be.a("string");
    expect(metadataPda.toString().length).to.be.within(43, 44);
  });

  it("should verify mint fee is set correctly", async () => {
    const adminState = await testContext.fetchAdminState();
    expect(adminState.mintFee.toNumber()).to.equal(1_000_000);
  });

  it("should verify mint start date can be set to future", async () => {
    const futureDate = new anchor.BN(Math.floor(Date.now() / 1000) + 86400);
    await testContext.program.methods
      .updateMintStartDate(futureDate)
      .accounts({
        superAdmin: testContext.admin.publicKey,
      })
      .signers([testContext.admin])
      .rpc();

    const adminState = await testContext.fetchAdminState();
    expect(adminState.mintStartDate.toString()).to.equal(futureDate.toString());

    // Reset to 0
    await testContext.program.methods
      .updateMintStartDate(new anchor.BN(0))
      .accounts({
        superAdmin: testContext.admin.publicKey,
      })
      .signers([testContext.admin])
      .rpc();
  });
});
