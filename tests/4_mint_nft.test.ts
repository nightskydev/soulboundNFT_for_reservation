import * as anchor from "@coral-xyz/anchor";
import { expect } from "chai";
import {
  testContext,
  initializeTestContext,
  OG_MINT_FEE,
  REGULAR_MINT_FEE,
  BASIC_MINT_FEE,
  OG_MAX_SUPPLY,
  REGULAR_MAX_SUPPLY,
  BASIC_MAX_SUPPLY,
  OG_ADMIN_MINT_LIMIT,
  REGULAR_ADMIN_MINT_LIMIT,
  BASIC_ADMIN_MINT_LIMIT,
  MINT_START_DATE
} from "./setup";
import { Keypair, PublicKey, ComputeBudgetProgram } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync, mintTo, getAccount } from "@solana/spl-token";
import { BN } from "bn.js";

const METAPLEX_PROGRAM_ID = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");
const SYSVAR_INSTRUCTIONS_PUBKEY = new PublicKey("Sysvar1nstructions1111111111111111111111111");

describe("mint_nft", () => {
  let user1OgNftMint: Keypair;
  let user2RegularNftMint: Keypair;
  let user3BasicNftMint: Keypair;
  let user4OgNftMint: Keypair;

  before(async () => {
    await initializeTestContext();

    // Initialize admin if not already done
    if (!testContext.adminInitialized) {
      // Create collection mint keypairs
      const ogCollectionMintKeypair = Keypair.generate();
      const regularCollectionMintKeypair = Keypair.generate();
      const basicCollectionMintKeypair = Keypair.generate();

      // We need to initialize admin first with placeholder mints, then create the collection NFTs
      await testContext.program.methods
        .initAdmin(
          ogCollectionMintKeypair.publicKey,
          OG_MINT_FEE,
          OG_MAX_SUPPLY,
          OG_ADMIN_MINT_LIMIT,
          regularCollectionMintKeypair.publicKey,
          REGULAR_MINT_FEE,
          REGULAR_MAX_SUPPLY,
          REGULAR_ADMIN_MINT_LIMIT,
          basicCollectionMintKeypair.publicKey,
          BASIC_MINT_FEE,
          BASIC_MAX_SUPPLY,
          BASIC_ADMIN_MINT_LIMIT,
          testContext.withdrawWallet.publicKey,
          MINT_START_DATE
        )
        .accounts({
          superAdmin: testContext.admin.publicKey,
          paymentMint: testContext.usdcMint,
          paymentTokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([testContext.admin])
        .rpc();
      
      // Now create the collection NFTs with metadata and master editions
      // OG Collection
      const ogCollectionTokenAccount = getAssociatedTokenAddressSync(
        ogCollectionMintKeypair.publicKey,
        testContext.adminStatePda,
        true
      );
      const [ogMetadata] = PublicKey.findProgramAddressSync(
        [Buffer.from("metadata"), METAPLEX_PROGRAM_ID.toBuffer(), ogCollectionMintKeypair.publicKey.toBuffer()],
        METAPLEX_PROGRAM_ID
      );
      const [ogMasterEdition] = PublicKey.findProgramAddressSync(
        [Buffer.from("metadata"), METAPLEX_PROGRAM_ID.toBuffer(), ogCollectionMintKeypair.publicKey.toBuffer(), Buffer.from("edition")],
        METAPLEX_PROGRAM_ID
      );

      await testContext.program.methods
        .createCollectionNft("OG Collection", "OG", "https://example.com/og.json")
        .accounts({
          signer: testContext.admin.publicKey,
          collectionMint: ogCollectionMintKeypair.publicKey,
          collectionTokenAccount: ogCollectionTokenAccount,
          metadataAccount: ogMetadata,
          masterEditionAccount: ogMasterEdition,
        })
        .preInstructions([ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 })])
        .signers([testContext.admin, ogCollectionMintKeypair])
        .rpc();

      // Regular Collection
      const regularCollectionTokenAccount = getAssociatedTokenAddressSync(
        regularCollectionMintKeypair.publicKey,
        testContext.adminStatePda,
        true
      );
      const [regularMetadata] = PublicKey.findProgramAddressSync(
        [Buffer.from("metadata"), METAPLEX_PROGRAM_ID.toBuffer(), regularCollectionMintKeypair.publicKey.toBuffer()],
        METAPLEX_PROGRAM_ID
      );
      const [regularMasterEdition] = PublicKey.findProgramAddressSync(
        [Buffer.from("metadata"), METAPLEX_PROGRAM_ID.toBuffer(), regularCollectionMintKeypair.publicKey.toBuffer(), Buffer.from("edition")],
        METAPLEX_PROGRAM_ID
      );

      await testContext.program.methods
        .createCollectionNft("Regular Collection", "REG", "https://example.com/regular.json")
        .accounts({
          signer: testContext.admin.publicKey,
          collectionMint: regularCollectionMintKeypair.publicKey,
          collectionTokenAccount: regularCollectionTokenAccount,
          metadataAccount: regularMetadata,
          masterEditionAccount: regularMasterEdition,
        })
        .preInstructions([ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 })])
        .signers([testContext.admin, regularCollectionMintKeypair])
        .rpc();

      // Basic Collection
      const basicCollectionTokenAccount = getAssociatedTokenAddressSync(
        basicCollectionMintKeypair.publicKey,
        testContext.adminStatePda,
        true
      );
      const [basicMetadata] = PublicKey.findProgramAddressSync(
        [Buffer.from("metadata"), METAPLEX_PROGRAM_ID.toBuffer(), basicCollectionMintKeypair.publicKey.toBuffer()],
        METAPLEX_PROGRAM_ID
      );
      const [basicMasterEdition] = PublicKey.findProgramAddressSync(
        [Buffer.from("metadata"), METAPLEX_PROGRAM_ID.toBuffer(), basicCollectionMintKeypair.publicKey.toBuffer(), Buffer.from("edition")],
        METAPLEX_PROGRAM_ID
      );

      await testContext.program.methods
        .createCollectionNft("Basic Collection", "BASIC", "https://example.com/basic.json")
        .accounts({
          signer: testContext.admin.publicKey,
          collectionMint: basicCollectionMintKeypair.publicKey,
          collectionTokenAccount: basicCollectionTokenAccount,
          metadataAccount: basicMetadata,
          masterEditionAccount: basicMasterEdition,
        })
        .preInstructions([ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 })])
        .signers([testContext.admin, basicCollectionMintKeypair])
        .rpc();

      // Store collection mints
      testContext.ogCollectionMint = ogCollectionMintKeypair.publicKey;
      testContext.regularCollectionMint = regularCollectionMintKeypair.publicKey;
      testContext.basicCollectionMint = basicCollectionMintKeypair.publicKey;
      
      testContext.adminInitialized = true;
    } else {
      // Admin is already initialized, but we need to create collection NFTs if they don't exist
      // Check if we need to update collection mints to ones with proper metadata
      const adminState = await testContext.fetchAdminState();
      
      // Check if Regular and Basic collection mints have metadata
      const [regularMetadataPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("metadata"), METAPLEX_PROGRAM_ID.toBuffer(), adminState.regularCollection.collectionMint.toBuffer()],
        METAPLEX_PROGRAM_ID
      );
      
      const regularMetadataInfo = await testContext.connection.getAccountInfo(regularMetadataPda);
      
      if (!regularMetadataInfo) {
        // Need to create proper collection NFTs and update admin state
        const regularCollectionMintKeypair = Keypair.generate();
        const basicCollectionMintKeypair = Keypair.generate();

        // Create Regular Collection
        const regularCollectionTokenAccount = getAssociatedTokenAddressSync(
          regularCollectionMintKeypair.publicKey,
          testContext.adminStatePda,
          true
        );
        const [regularMetadata] = PublicKey.findProgramAddressSync(
          [Buffer.from("metadata"), METAPLEX_PROGRAM_ID.toBuffer(), regularCollectionMintKeypair.publicKey.toBuffer()],
          METAPLEX_PROGRAM_ID
        );
        const [regularMasterEdition] = PublicKey.findProgramAddressSync(
          [Buffer.from("metadata"), METAPLEX_PROGRAM_ID.toBuffer(), regularCollectionMintKeypair.publicKey.toBuffer(), Buffer.from("edition")],
          METAPLEX_PROGRAM_ID
        );

        await testContext.program.methods
          .createCollectionNft("Regular Collection", "REG", "https://example.com/regular.json")
          .accounts({
            signer: testContext.admin.publicKey,
            collectionMint: regularCollectionMintKeypair.publicKey,
            collectionTokenAccount: regularCollectionTokenAccount,
            metadataAccount: regularMetadata,
            masterEditionAccount: regularMasterEdition,
          })
          .preInstructions([ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 })])
          .signers([testContext.admin, regularCollectionMintKeypair])
          .rpc();

        // Create Basic Collection
        const basicCollectionTokenAccount = getAssociatedTokenAddressSync(
          basicCollectionMintKeypair.publicKey,
          testContext.adminStatePda,
          true
        );
        const [basicMetadata] = PublicKey.findProgramAddressSync(
          [Buffer.from("metadata"), METAPLEX_PROGRAM_ID.toBuffer(), basicCollectionMintKeypair.publicKey.toBuffer()],
          METAPLEX_PROGRAM_ID
        );
        const [basicMasterEdition] = PublicKey.findProgramAddressSync(
          [Buffer.from("metadata"), METAPLEX_PROGRAM_ID.toBuffer(), basicCollectionMintKeypair.publicKey.toBuffer(), Buffer.from("edition")],
          METAPLEX_PROGRAM_ID
        );

        await testContext.program.methods
          .createCollectionNft("Basic Collection", "BASIC", "https://example.com/basic.json")
          .accounts({
            signer: testContext.admin.publicKey,
            collectionMint: basicCollectionMintKeypair.publicKey,
            collectionTokenAccount: basicCollectionTokenAccount,
            metadataAccount: basicMetadata,
            masterEditionAccount: basicMasterEdition,
          })
          .preInstructions([ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 })])
          .signers([testContext.admin, basicCollectionMintKeypair])
          .rpc();

        // Update admin state with new collection mints
        await testContext.program.methods
          .updateCollectionMint({ regular: {} }, regularCollectionMintKeypair.publicKey)
          .accounts({ superAdmin: testContext.admin.publicKey })
          .signers([testContext.admin])
          .rpc();

        await testContext.program.methods
          .updateCollectionMint({ basic: {} }, basicCollectionMintKeypair.publicKey)
          .accounts({ superAdmin: testContext.admin.publicKey })
          .signers([testContext.admin])
          .rpc();

        // Update test context
        testContext.regularCollectionMint = regularCollectionMintKeypair.publicKey;
        testContext.basicCollectionMint = basicCollectionMintKeypair.publicKey;
      }
    }

    // Fund users with USDC for minting
    await mintTo(
      testContext.provider.connection,
      testContext.admin,
      testContext.usdcMint,
      testContext.user1.tokenAccount,
      testContext.admin,
      20_000_000 // 20 USDC
    );

    await mintTo(
      testContext.provider.connection,
      testContext.admin,
      testContext.usdcMint,
      testContext.user2.tokenAccount,
      testContext.admin,
      20_000_000 // 20 USDC
    );

    await mintTo(
      testContext.provider.connection,
      testContext.admin,
      testContext.usdcMint,
      testContext.user3.tokenAccount,
      testContext.admin,
      20_000_000 // 20 USDC
    );

    await mintTo(
      testContext.provider.connection,
      testContext.admin,
      testContext.usdcMint,
      testContext.user4.tokenAccount,
      testContext.admin,
      20_000_000 // 20 USDC
    );
  });

  it("should mint OG NFT successfully", async () => {
    user1OgNftMint = Keypair.generate();
    
    const nftTokenAccount = getAssociatedTokenAddressSync(
      user1OgNftMint.publicKey,
      testContext.user1.keypair.publicKey
    );

    // Derive metadata PDA
    const [metadataAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from("metadata"), METAPLEX_PROGRAM_ID.toBuffer(), user1OgNftMint.publicKey.toBuffer()],
      METAPLEX_PROGRAM_ID
    );

    // Derive collection metadata and master edition PDAs
    const [collectionMetadataAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from("metadata"), METAPLEX_PROGRAM_ID.toBuffer(), testContext.ogCollectionMint!.toBuffer()],
      METAPLEX_PROGRAM_ID
    );
    const [collectionMasterEditionAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from("metadata"), METAPLEX_PROGRAM_ID.toBuffer(), testContext.ogCollectionMint!.toBuffer(), Buffer.from("edition")],
      METAPLEX_PROGRAM_ID
    );

    // Add compute budget for Metaplex operations
    const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({
      units: 400_000,
    });

    // Get vault balance before
    const vaultBalanceBefore = await testContext.getVaultBalance();

    await testContext.program.methods
      .mintNft({ og: {} }, "OG NFT #1", "OG", "https://example.com/og1.json")
      .accounts({
        signer: testContext.user1.keypair.publicKey,
        tokenAccount: nftTokenAccount,
        mint: user1OgNftMint.publicKey,
        metadataAccount: metadataAccount,
        paymentMint: testContext.usdcMint,
        payerTokenAccount: testContext.user1.tokenAccount,
        paymentTokenProgram: TOKEN_PROGRAM_ID,
        collectionMint: testContext.ogCollectionMint,
        collectionMetadata: collectionMetadataAccount,
        collectionMasterEdition: collectionMasterEditionAccount,
        sysvarInstructions: SYSVAR_INSTRUCTIONS_PUBKEY,
      })
      .preInstructions([modifyComputeUnits])
      .signers([testContext.user1.keypair, user1OgNftMint])
      .rpc();

    // Verify NFT token account has 1 token
    const tokenAccountInfo = await getAccount(testContext.provider.connection, nftTokenAccount);
    expect(Number(tokenAccountInfo.amount)).to.equal(1);

    // Verify vault received payment (OG fee: 5 USDC)
    const vaultBalanceAfter = await testContext.getVaultBalance();
    expect(Number(vaultBalanceAfter - vaultBalanceBefore)).to.equal(Number(OG_MINT_FEE));

    // Verify OG collection count increased
    const adminState = await testContext.fetchAdminState();
    expect(adminState.ogCollection.currentReservedCount.toNumber()).to.equal(1);
    expect(adminState.regularCollection.currentReservedCount.toNumber()).to.equal(0);
    expect(adminState.basicCollection.currentReservedCount.toNumber()).to.equal(0);
  });

  it("should mint Regular NFT successfully", async () => {
    user2RegularNftMint = Keypair.generate();

    const nftTokenAccount = getAssociatedTokenAddressSync(
      user2RegularNftMint.publicKey,
      testContext.user2.keypair.publicKey
    );

    const [metadataAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from("metadata"), METAPLEX_PROGRAM_ID.toBuffer(), user2RegularNftMint.publicKey.toBuffer()],
      METAPLEX_PROGRAM_ID
    );

    const [collectionMetadataAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from("metadata"), METAPLEX_PROGRAM_ID.toBuffer(), testContext.regularCollectionMint!.toBuffer()],
      METAPLEX_PROGRAM_ID
    );
    const [collectionMasterEditionAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from("metadata"), METAPLEX_PROGRAM_ID.toBuffer(), testContext.regularCollectionMint!.toBuffer(), Buffer.from("edition")],
      METAPLEX_PROGRAM_ID
    );

    const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({
      units: 400_000,
    });

    const vaultBalanceBefore = await testContext.getVaultBalance();

    await testContext.program.methods
      .mintNft({ regular: {} }, "Regular NFT #1", "REG", "https://example.com/regular1.json")
      .accounts({
        signer: testContext.user2.keypair.publicKey,
        tokenAccount: nftTokenAccount,
        mint: user2RegularNftMint.publicKey,
        metadataAccount: metadataAccount,
        paymentMint: testContext.usdcMint,
        payerTokenAccount: testContext.user2.tokenAccount,
        paymentTokenProgram: TOKEN_PROGRAM_ID,
        collectionMint: testContext.regularCollectionMint,
        collectionMetadata: collectionMetadataAccount,
        collectionMasterEdition: collectionMasterEditionAccount,
        sysvarInstructions: SYSVAR_INSTRUCTIONS_PUBKEY,
      })
      .preInstructions([modifyComputeUnits])
      .signers([testContext.user2.keypair, user2RegularNftMint])
      .rpc();

    const tokenAccountInfo = await getAccount(testContext.provider.connection, nftTokenAccount);
    expect(Number(tokenAccountInfo.amount)).to.equal(1);

    // Verify vault received payment (Regular fee: 3 USDC)
    const vaultBalanceAfter = await testContext.getVaultBalance();
    expect(Number(vaultBalanceAfter - vaultBalanceBefore)).to.equal(Number(REGULAR_MINT_FEE));

    // Verify Regular collection count increased
    const adminState = await testContext.fetchAdminState();
    expect(adminState.ogCollection.currentReservedCount.toNumber()).to.equal(1);
    expect(adminState.regularCollection.currentReservedCount.toNumber()).to.equal(1);
    expect(adminState.basicCollection.currentReservedCount.toNumber()).to.equal(0);
  });

  it("should mint Basic NFT successfully", async () => {
    user3BasicNftMint = Keypair.generate();

    const nftTokenAccount = getAssociatedTokenAddressSync(
      user3BasicNftMint.publicKey,
      testContext.user3.keypair.publicKey
    );

    const [metadataAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from("metadata"), METAPLEX_PROGRAM_ID.toBuffer(), user3BasicNftMint.publicKey.toBuffer()],
      METAPLEX_PROGRAM_ID
    );

    const [collectionMetadataAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from("metadata"), METAPLEX_PROGRAM_ID.toBuffer(), testContext.basicCollectionMint!.toBuffer()],
      METAPLEX_PROGRAM_ID
    );
    const [collectionMasterEditionAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from("metadata"), METAPLEX_PROGRAM_ID.toBuffer(), testContext.basicCollectionMint!.toBuffer(), Buffer.from("edition")],
      METAPLEX_PROGRAM_ID
    );

    const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({
      units: 400_000,
    });

    const vaultBalanceBefore = await testContext.getVaultBalance();

    await testContext.program.methods
      .mintNft({ basic: {} }, "Basic NFT #1", "BASIC", "https://example.com/basic1.json")
      .accounts({
        signer: testContext.user3.keypair.publicKey,
        tokenAccount: nftTokenAccount,
        mint: user3BasicNftMint.publicKey,
        metadataAccount: metadataAccount,
        paymentMint: testContext.usdcMint,
        payerTokenAccount: testContext.user3.tokenAccount,
        paymentTokenProgram: TOKEN_PROGRAM_ID,
        collectionMint: testContext.basicCollectionMint,
        collectionMetadata: collectionMetadataAccount,
        collectionMasterEdition: collectionMasterEditionAccount,
        sysvarInstructions: SYSVAR_INSTRUCTIONS_PUBKEY,
      })
      .preInstructions([modifyComputeUnits])
      .signers([testContext.user3.keypair, user3BasicNftMint])
      .rpc();

    const tokenAccountInfo = await getAccount(testContext.provider.connection, nftTokenAccount);
    expect(Number(tokenAccountInfo.amount)).to.equal(1);

    // Verify vault received payment (Basic fee: 1 USDC)
    const vaultBalanceAfter = await testContext.getVaultBalance();
    expect(Number(vaultBalanceAfter - vaultBalanceBefore)).to.equal(Number(BASIC_MINT_FEE));

    // Verify Basic collection count increased
    const adminState = await testContext.fetchAdminState();
    expect(adminState.ogCollection.currentReservedCount.toNumber()).to.equal(1);
    expect(adminState.regularCollection.currentReservedCount.toNumber()).to.equal(1);
    expect(adminState.basicCollection.currentReservedCount.toNumber()).to.equal(1);
  });

  it("should allow user4 to mint another OG NFT (different wallet)", async () => {
    user4OgNftMint = Keypair.generate();

    const nftTokenAccount = getAssociatedTokenAddressSync(
      user4OgNftMint.publicKey,
      testContext.user4.keypair.publicKey
    );

    const [metadataAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from("metadata"), METAPLEX_PROGRAM_ID.toBuffer(), user4OgNftMint.publicKey.toBuffer()],
      METAPLEX_PROGRAM_ID
    );

    const [collectionMetadataAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from("metadata"), METAPLEX_PROGRAM_ID.toBuffer(), testContext.ogCollectionMint!.toBuffer()],
      METAPLEX_PROGRAM_ID
    );
    const [collectionMasterEditionAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from("metadata"), METAPLEX_PROGRAM_ID.toBuffer(), testContext.ogCollectionMint!.toBuffer(), Buffer.from("edition")],
      METAPLEX_PROGRAM_ID
    );

    const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({
      units: 400_000,
    });

    const ogCountBefore = (await testContext.fetchAdminState()).ogCollection.currentReservedCount.toNumber();
    const vaultBalanceBefore = await testContext.getVaultBalance();

    await testContext.program.methods
      .mintNft({ og: {} }, "OG NFT #2", "OG", "https://example.com/og2.json")
      .accounts({
        signer: testContext.user4.keypair.publicKey,
        tokenAccount: nftTokenAccount,
        mint: user4OgNftMint.publicKey,
        metadataAccount: metadataAccount,
        paymentMint: testContext.usdcMint,
        payerTokenAccount: testContext.user4.tokenAccount,
        paymentTokenProgram: TOKEN_PROGRAM_ID,
        collectionMint: testContext.ogCollectionMint,
        collectionMetadata: collectionMetadataAccount,
        collectionMasterEdition: collectionMasterEditionAccount,
        sysvarInstructions: SYSVAR_INSTRUCTIONS_PUBKEY,
      })
      .preInstructions([modifyComputeUnits])
      .signers([testContext.user4.keypair, user4OgNftMint])
      .rpc();

    const tokenAccountInfo = await getAccount(testContext.provider.connection, nftTokenAccount);
    expect(Number(tokenAccountInfo.amount)).to.equal(1);

    // Verify OG count increased and payment was received
    const ogCountAfter = (await testContext.fetchAdminState()).ogCollection.currentReservedCount.toNumber();
    expect(ogCountAfter).to.equal(ogCountBefore + 1);

    const vaultBalanceAfter = await testContext.getVaultBalance();
    expect(Number(vaultBalanceAfter - vaultBalanceBefore)).to.equal(Number(OG_MINT_FEE));
  });

  it("should prevent user from minting multiple NFTs (one NFT per wallet restriction)", async () => {
    const secondMint = Keypair.generate();

    const nftTokenAccount = getAssociatedTokenAddressSync(
      secondMint.publicKey,
      testContext.user1.keypair.publicKey // Same wallet that already minted an OG NFT
    );

    const [metadataAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from("metadata"), METAPLEX_PROGRAM_ID.toBuffer(), secondMint.publicKey.toBuffer()],
      METAPLEX_PROGRAM_ID
    );

    const [collectionMetadataAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from("metadata"), METAPLEX_PROGRAM_ID.toBuffer(), testContext.regularCollectionMint!.toBuffer()],
      METAPLEX_PROGRAM_ID
    );
    const [collectionMasterEditionAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from("metadata"), METAPLEX_PROGRAM_ID.toBuffer(), testContext.regularCollectionMint!.toBuffer(), Buffer.from("edition")],
      METAPLEX_PROGRAM_ID
    );

    const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({
      units: 400_000,
    });

    // This should fail because user1 already minted an NFT
    try {
      await testContext.program.methods
        .mintNft({ regular: {} }, "Regular NFT #2", "REG", "https://example.com/regular2.json")
        .accounts({
          signer: testContext.user1.keypair.publicKey, // Same user that already minted
          tokenAccount: nftTokenAccount,
          mint: secondMint.publicKey,
          metadataAccount: metadataAccount,
          paymentMint: testContext.usdcMint,
          payerTokenAccount: testContext.user1.tokenAccount,
          paymentTokenProgram: TOKEN_PROGRAM_ID,
          collectionMint: testContext.regularCollectionMint,
          collectionMetadata: collectionMetadataAccount,
          collectionMasterEdition: collectionMasterEditionAccount,
          sysvarInstructions: SYSVAR_INSTRUCTIONS_PUBKEY,
        })
        .preInstructions([modifyComputeUnits])
        .signers([testContext.user1.keypair, secondMint])
        .rpc();

      // If we reach here, the test should fail
      expect.fail("Expected minting to fail for user who already minted an NFT");
    } catch (error: any) {
      // Verify the error is the expected UserAlreadyMinted error
      expect(error.message).to.include("UserAlreadyMinted");
    }
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

  it("should verify different collection fees", async () => {
    const adminState = await testContext.fetchAdminState();
    expect(adminState.ogCollection.mintFee.toString()).to.equal(OG_MINT_FEE.toString());
    expect(adminState.regularCollection.mintFee.toString()).to.equal(REGULAR_MINT_FEE.toString());
    expect(adminState.basicCollection.mintFee.toString()).to.equal(BASIC_MINT_FEE.toString());
  });
});
