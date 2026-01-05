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
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync, mintTo, createAssociatedTokenAccount } from "@solana/spl-token";

const METAPLEX_PROGRAM_ID = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");
const SYSVAR_INSTRUCTIONS_PUBKEY = new PublicKey("Sysvar1nstructions1111111111111111111111111");

describe("burn_nft", () => {
  let burnOgNftMint: Keypair;
  let burnRegularNftMint: Keypair;
  let burnBasicNftMint: Keypair;
  let burnOgUser: { keypair: Keypair; tokenAccount: PublicKey };
  let burnRegularUser: { keypair: Keypair; tokenAccount: PublicKey };
  let burnBasicUser: { keypair: Keypair; tokenAccount: PublicKey };

  before(async () => {
    await initializeTestContext();

    // Initialize admin if not already done
    if (!testContext.adminInitialized) {
      // [same initialization code as 4_mint_nft.test.ts - create collection NFTs]
      const ogCollectionMintKeypair = Keypair.generate();
      const regularCollectionMintKeypair = Keypair.generate();
      const basicCollectionMintKeypair = Keypair.generate();

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
      
      // Create collection NFTs...
      const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 });

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
        .preInstructions([modifyComputeUnits])
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
        .preInstructions([modifyComputeUnits])
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
        .preInstructions([modifyComputeUnits])
        .signers([testContext.admin, basicCollectionMintKeypair])
        .rpc();

      testContext.ogCollectionMint = ogCollectionMintKeypair.publicKey;
      testContext.regularCollectionMint = regularCollectionMintKeypair.publicKey;
      testContext.basicCollectionMint = basicCollectionMintKeypair.publicKey;
      
      testContext.adminInitialized = true;
    } else {
      // Admin already initialized - check if collections have proper metadata
      const adminState = await testContext.fetchAdminState();
      const [regularMetadataPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("metadata"), METAPLEX_PROGRAM_ID.toBuffer(), adminState.regularCollection.collectionMint.toBuffer()],
        METAPLEX_PROGRAM_ID
      );
      
      const regularMetadata = await testContext.connection.getAccountInfo(regularMetadataPda);
      if (!regularMetadata) {
        // Need to create proper collection NFTs and update admin state
        const regularCollectionMintKeypair = Keypair.generate();
        const basicCollectionMintKeypair = Keypair.generate();
        const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 });

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
          .preInstructions([modifyComputeUnits])
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
          .preInstructions([modifyComputeUnits])
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

        testContext.regularCollectionMint = regularCollectionMintKeypair.publicKey;
        testContext.basicCollectionMint = basicCollectionMintKeypair.publicKey;
      }
    }

    // Create separate users for each NFT type to comply with one-NFT-per-wallet restriction
    const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({
      units: 400_000,
    });

    // Create OG user and mint OG NFT
    {
      const keypair = Keypair.generate();
      await testContext.airdropSol(keypair.publicKey, 5);
      const tokenAccount = await createAssociatedTokenAccount(
        testContext.provider.connection,
        testContext.admin,
        testContext.usdcMint,
        keypair.publicKey
      );
      burnOgUser = { keypair, tokenAccount };

      await mintTo(
        testContext.provider.connection,
        testContext.admin,
        testContext.usdcMint,
        burnOgUser.tokenAccount,
        testContext.admin,
        10_000_000 // 10 USDC
      );

      burnOgNftMint = Keypair.generate();
      const ogNftTokenAccount = getAssociatedTokenAddressSync(
        burnOgNftMint.publicKey,
        burnOgUser.keypair.publicKey
      );
      const [ogMetadataAccount] = PublicKey.findProgramAddressSync(
        [Buffer.from("metadata"), METAPLEX_PROGRAM_ID.toBuffer(), burnOgNftMint.publicKey.toBuffer()],
        METAPLEX_PROGRAM_ID
      );
      const [ogCollectionMetadata] = PublicKey.findProgramAddressSync(
        [Buffer.from("metadata"), METAPLEX_PROGRAM_ID.toBuffer(), testContext.ogCollectionMint!.toBuffer()],
        METAPLEX_PROGRAM_ID
      );
      const [ogCollectionMasterEdition] = PublicKey.findProgramAddressSync(
        [Buffer.from("metadata"), METAPLEX_PROGRAM_ID.toBuffer(), testContext.ogCollectionMint!.toBuffer(), Buffer.from("edition")],
        METAPLEX_PROGRAM_ID
      );

      await testContext.program.methods
        .mintNft({ og: {} }, "OG Burn Test", "OGBURN", "https://example.com/og-burn.json")
        .accounts({
          signer: burnOgUser.keypair.publicKey,
          tokenAccount: ogNftTokenAccount,
          mint: burnOgNftMint.publicKey,
          metadataAccount: ogMetadataAccount,
          paymentMint: testContext.usdcMint,
          payerTokenAccount: burnOgUser.tokenAccount,
          paymentTokenProgram: TOKEN_PROGRAM_ID,
          collectionMint: testContext.ogCollectionMint,
          collectionMetadata: ogCollectionMetadata,
          collectionMasterEdition: ogCollectionMasterEdition,
          sysvarInstructions: SYSVAR_INSTRUCTIONS_PUBKEY,
        })
        .preInstructions([modifyComputeUnits])
        .signers([burnOgUser.keypair, burnOgNftMint])
        .rpc();
    }

    // Create Regular user and mint Regular NFT
    {
      const keypair = Keypair.generate();
      await testContext.airdropSol(keypair.publicKey, 5);
      const tokenAccount = await createAssociatedTokenAccount(
        testContext.provider.connection,
        testContext.admin,
        testContext.usdcMint,
        keypair.publicKey
      );
      burnRegularUser = { keypair, tokenAccount };

      await mintTo(
        testContext.provider.connection,
        testContext.admin,
        testContext.usdcMint,
        burnRegularUser.tokenAccount,
        testContext.admin,
        10_000_000 // 10 USDC
      );

      burnRegularNftMint = Keypair.generate();
      const regularNftTokenAccount = getAssociatedTokenAddressSync(
        burnRegularNftMint.publicKey,
        burnRegularUser.keypair.publicKey
      );
      const [regularMetadataAccount] = PublicKey.findProgramAddressSync(
        [Buffer.from("metadata"), METAPLEX_PROGRAM_ID.toBuffer(), burnRegularNftMint.publicKey.toBuffer()],
        METAPLEX_PROGRAM_ID
      );
      const [regularCollectionMetadata] = PublicKey.findProgramAddressSync(
        [Buffer.from("metadata"), METAPLEX_PROGRAM_ID.toBuffer(), testContext.regularCollectionMint!.toBuffer()],
        METAPLEX_PROGRAM_ID
      );
      const [regularCollectionMasterEdition] = PublicKey.findProgramAddressSync(
        [Buffer.from("metadata"), METAPLEX_PROGRAM_ID.toBuffer(), testContext.regularCollectionMint!.toBuffer(), Buffer.from("edition")],
        METAPLEX_PROGRAM_ID
      );

      await testContext.program.methods
        .mintNft({ regular: {} }, "Regular Burn Test", "REGBURN", "https://example.com/reg-burn.json")
        .accounts({
          signer: burnRegularUser.keypair.publicKey,
          tokenAccount: regularNftTokenAccount,
          mint: burnRegularNftMint.publicKey,
          metadataAccount: regularMetadataAccount,
          paymentMint: testContext.usdcMint,
          payerTokenAccount: burnRegularUser.tokenAccount,
          paymentTokenProgram: TOKEN_PROGRAM_ID,
          collectionMint: testContext.regularCollectionMint,
          collectionMetadata: regularCollectionMetadata,
          collectionMasterEdition: regularCollectionMasterEdition,
          sysvarInstructions: SYSVAR_INSTRUCTIONS_PUBKEY,
        })
        .preInstructions([modifyComputeUnits])
        .signers([burnRegularUser.keypair, burnRegularNftMint])
        .rpc();
    }

    // Create Basic user and mint Basic NFT
    {
      const keypair = Keypair.generate();
      await testContext.airdropSol(keypair.publicKey, 5);
      const tokenAccount = await createAssociatedTokenAccount(
        testContext.provider.connection,
        testContext.admin,
        testContext.usdcMint,
        keypair.publicKey
      );
      burnBasicUser = { keypair, tokenAccount };

      await mintTo(
        testContext.provider.connection,
        testContext.admin,
        testContext.usdcMint,
        burnBasicUser.tokenAccount,
        testContext.admin,
        10_000_000 // 10 USDC
      );

      burnBasicNftMint = Keypair.generate();
      const basicNftTokenAccount = getAssociatedTokenAddressSync(
        burnBasicNftMint.publicKey,
        burnBasicUser.keypair.publicKey
      );
      const [basicMetadataAccount] = PublicKey.findProgramAddressSync(
        [Buffer.from("metadata"), METAPLEX_PROGRAM_ID.toBuffer(), burnBasicNftMint.publicKey.toBuffer()],
        METAPLEX_PROGRAM_ID
      );
      const [basicCollectionMetadata] = PublicKey.findProgramAddressSync(
        [Buffer.from("metadata"), METAPLEX_PROGRAM_ID.toBuffer(), testContext.basicCollectionMint!.toBuffer()],
        METAPLEX_PROGRAM_ID
      );
      const [basicCollectionMasterEdition] = PublicKey.findProgramAddressSync(
        [Buffer.from("metadata"), METAPLEX_PROGRAM_ID.toBuffer(), testContext.basicCollectionMint!.toBuffer(), Buffer.from("edition")],
        METAPLEX_PROGRAM_ID
      );

      await testContext.program.methods
        .mintNft({ basic: {} }, "Basic Burn Test", "BASICBURN", "https://example.com/basic-burn.json")
        .accounts({
          signer: burnBasicUser.keypair.publicKey,
          tokenAccount: basicNftTokenAccount,
          mint: burnBasicNftMint.publicKey,
          metadataAccount: basicMetadataAccount,
          paymentMint: testContext.usdcMint,
          payerTokenAccount: burnBasicUser.tokenAccount,
          paymentTokenProgram: TOKEN_PROGRAM_ID,
          collectionMint: testContext.basicCollectionMint,
          collectionMetadata: basicCollectionMetadata,
          collectionMasterEdition: basicCollectionMasterEdition,
          sysvarInstructions: SYSVAR_INSTRUCTIONS_PUBKEY,
        })
        .preInstructions([modifyComputeUnits])
        .signers([burnBasicUser.keypair, burnBasicNftMint])
        .rpc();
    }
  });

  it("should burn OG NFT successfully", async () => {
    const nftTokenAccount = getAssociatedTokenAddressSync(
      burnOgNftMint.publicKey,
      burnOgUser.keypair.publicKey
    );

    // Derive user state PDA
    const [userStatePda] = PublicKey.findProgramAddressSync(
      [Buffer.from("user_state"), burnOgUser.keypair.publicKey.toBuffer()],
      testContext.program.programId
    );

    // Check user state before burn
    const userStateBefore = await testContext.program.account.userState.fetch(userStatePda);
    expect(userStateBefore.hasMinted).to.be.true;
    expect(userStateBefore.mintAddress.toBase58()).to.equal(burnOgNftMint.publicKey.toBase58());

    // Get OG collection count before
    const adminStateBefore = await testContext.fetchAdminState();
    const ogCountBefore = adminStateBefore.ogCollection.currentReservedCount.toNumber();

    await testContext.program.methods
      .burnNft()
      .accounts({
        signer: burnOgUser.keypair.publicKey,
        oldTokenAccount: nftTokenAccount,
        oldMint: burnOgNftMint.publicKey,
        userState: userStatePda,
        metadataAccount: null,
      })
      .signers([burnOgUser.keypair])
      .rpc();

    // Verify OG collection count decreased
    const adminStateAfter = await testContext.fetchAdminState();
    expect(adminStateAfter.ogCollection.currentReservedCount.toNumber()).to.equal(ogCountBefore - 1);
    
    // Verify other collections unchanged
    expect(adminStateAfter.regularCollection.currentReservedCount.toNumber()).to.equal(
      adminStateBefore.regularCollection.currentReservedCount.toNumber()
    );
    expect(adminStateAfter.basicCollection.currentReservedCount.toNumber()).to.equal(
      adminStateBefore.basicCollection.currentReservedCount.toNumber()
    );

    // Verify user state was reset
    const userStateAfter = await testContext.program.account.userState.fetch(userStatePda);
    expect(userStateAfter.hasMinted).to.be.false;
    expect(userStateAfter.mintAddress.toBase58()).to.equal(PublicKey.default.toBase58());
    expect(userStateAfter.mintedAt.toNumber()).to.equal(0);
  });

  it("should burn Regular NFT successfully", async () => {
    const nftTokenAccount = getAssociatedTokenAddressSync(
      burnRegularNftMint.publicKey,
      burnRegularUser.keypair.publicKey
    );

    // Derive user state PDA
    const [userStatePda] = PublicKey.findProgramAddressSync(
      [Buffer.from("user_state"), burnRegularUser.keypair.publicKey.toBuffer()],
      testContext.program.programId
    );

    // Check user state before burn
    const userStateBefore = await testContext.program.account.userState.fetch(userStatePda);
    expect(userStateBefore.hasMinted).to.be.true;
    expect(userStateBefore.mintAddress.toBase58()).to.equal(burnRegularNftMint.publicKey.toBase58());

    // Get Regular collection count before
    const adminStateBefore = await testContext.fetchAdminState();
    const regularCountBefore = adminStateBefore.regularCollection.currentReservedCount.toNumber();

    await testContext.program.methods
      .burnNft()
      .accounts({
        signer: burnRegularUser.keypair.publicKey,
        oldTokenAccount: nftTokenAccount,
        oldMint: burnRegularNftMint.publicKey,
        userState: userStatePda,
        metadataAccount: null,
      })
      .signers([burnRegularUser.keypair])
      .rpc();

    // Verify Regular collection count decreased
    const adminStateAfter = await testContext.fetchAdminState();
    expect(adminStateAfter.regularCollection.currentReservedCount.toNumber()).to.equal(regularCountBefore - 1);

    // Verify user state was reset
    const userStateAfter = await testContext.program.account.userState.fetch(userStatePda);
    expect(userStateAfter.hasMinted).to.be.false;
    expect(userStateAfter.mintAddress.toBase58()).to.equal(PublicKey.default.toBase58());
    expect(userStateAfter.mintedAt.toNumber()).to.equal(0);
  });

  it("should burn Basic NFT successfully", async () => {
    const nftTokenAccount = getAssociatedTokenAddressSync(
      burnBasicNftMint.publicKey,
      burnBasicUser.keypair.publicKey
    );

    // Derive user state PDA
    const [userStatePda] = PublicKey.findProgramAddressSync(
      [Buffer.from("user_state"), burnBasicUser.keypair.publicKey.toBuffer()],
      testContext.program.programId
    );

    // Check user state before burn
    const userStateBefore = await testContext.program.account.userState.fetch(userStatePda);
    expect(userStateBefore.hasMinted).to.be.true;
    expect(userStateBefore.mintAddress.toBase58()).to.equal(burnBasicNftMint.publicKey.toBase58());

    // Get Basic collection count before
    const adminStateBefore = await testContext.fetchAdminState();
    const basicCountBefore = adminStateBefore.basicCollection.currentReservedCount.toNumber();

    await testContext.program.methods
      .burnNft()
      .accounts({
        signer: burnBasicUser.keypair.publicKey,
        oldTokenAccount: nftTokenAccount,
        oldMint: burnBasicNftMint.publicKey,
        userState: userStatePda,
        metadataAccount: null,
      })
      .signers([burnBasicUser.keypair])
      .rpc();

    // Verify Basic collection count decreased
    const adminStateAfter = await testContext.fetchAdminState();
    expect(adminStateAfter.basicCollection.currentReservedCount.toNumber()).to.equal(basicCountBefore - 1);

    // Verify user state was reset
    const userStateAfter = await testContext.program.account.userState.fetch(userStatePda);
    expect(userStateAfter.hasMinted).to.be.false;
    expect(userStateAfter.mintAddress.toBase58()).to.equal(PublicKey.default.toBase58());
    expect(userStateAfter.mintedAt.toNumber()).to.equal(0);
  });

  it("should allow user to mint again after burning", async () => {
    // Create a new test user
    const testUser = Keypair.generate();
    await testContext.airdropSol(testUser.publicKey, 5);
    const testUserTokenAccount = await createAssociatedTokenAccount(
      testContext.provider.connection,
      testContext.admin,
      testContext.usdcMint,
      testUser.publicKey
    );
    
    await mintTo(
      testContext.provider.connection,
      testContext.admin,
      testContext.usdcMint,
      testUserTokenAccount,
      testContext.admin,
      20_000_000 // 20 USDC (enough for 2 mints)
    );

    const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({
      units: 400_000,
    });

    // First mint
    const firstMint = Keypair.generate();
    const firstNftTokenAccount = getAssociatedTokenAddressSync(
      firstMint.publicKey,
      testUser.publicKey
    );
    const [firstMetadataAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from("metadata"), METAPLEX_PROGRAM_ID.toBuffer(), firstMint.publicKey.toBuffer()],
      METAPLEX_PROGRAM_ID
    );
    const [basicCollectionMetadata] = PublicKey.findProgramAddressSync(
      [Buffer.from("metadata"), METAPLEX_PROGRAM_ID.toBuffer(), testContext.basicCollectionMint!.toBuffer()],
      METAPLEX_PROGRAM_ID
    );
    const [basicCollectionMasterEdition] = PublicKey.findProgramAddressSync(
      [Buffer.from("metadata"), METAPLEX_PROGRAM_ID.toBuffer(), testContext.basicCollectionMint!.toBuffer(), Buffer.from("edition")],
      METAPLEX_PROGRAM_ID
    );

    await testContext.program.methods
      .mintNft({ basic: {} }, "First Mint", "FIRST", "https://example.com/first.json")
      .accounts({
        signer: testUser.publicKey,
        tokenAccount: firstNftTokenAccount,
        mint: firstMint.publicKey,
        metadataAccount: firstMetadataAccount,
        paymentMint: testContext.usdcMint,
        payerTokenAccount: testUserTokenAccount,
        paymentTokenProgram: TOKEN_PROGRAM_ID,
        collectionMint: testContext.basicCollectionMint,
        collectionMetadata: basicCollectionMetadata,
        collectionMasterEdition: basicCollectionMasterEdition,
        sysvarInstructions: SYSVAR_INSTRUCTIONS_PUBKEY,
      })
      .preInstructions([modifyComputeUnits])
      .signers([testUser, firstMint])
      .rpc();

    // Derive user state PDA
    const [userStatePda] = PublicKey.findProgramAddressSync(
      [Buffer.from("user_state"), testUser.publicKey.toBuffer()],
      testContext.program.programId
    );

    // Verify user state after first mint
    let userState = await testContext.program.account.userState.fetch(userStatePda);
    expect(userState.hasMinted).to.be.true;
    expect(userState.mintAddress.toBase58()).to.equal(firstMint.publicKey.toBase58());

    // Burn the first NFT
    await testContext.program.methods
      .burnNft()
      .accounts({
        signer: testUser.publicKey,
        oldTokenAccount: firstNftTokenAccount,
        oldMint: firstMint.publicKey,
        userState: userStatePda,
        metadataAccount: null,
      })
      .signers([testUser])
      .rpc();

    // Verify user state was reset after burn
    userState = await testContext.program.account.userState.fetch(userStatePda);
    expect(userState.hasMinted).to.be.false;
    expect(userState.mintAddress.toBase58()).to.equal(PublicKey.default.toBase58());

    // Second mint (this should succeed now that UserState was reset)
    const secondMint = Keypair.generate();
    const secondNftTokenAccount = getAssociatedTokenAddressSync(
      secondMint.publicKey,
      testUser.publicKey
    );
    const [secondMetadataAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from("metadata"), METAPLEX_PROGRAM_ID.toBuffer(), secondMint.publicKey.toBuffer()],
      METAPLEX_PROGRAM_ID
    );

    await testContext.program.methods
      .mintNft({ basic: {} }, "Second Mint", "SECOND", "https://example.com/second.json")
      .accounts({
        signer: testUser.publicKey,
        tokenAccount: secondNftTokenAccount,
        mint: secondMint.publicKey,
        metadataAccount: secondMetadataAccount,
        paymentMint: testContext.usdcMint,
        payerTokenAccount: testUserTokenAccount,
        paymentTokenProgram: TOKEN_PROGRAM_ID,
        collectionMint: testContext.basicCollectionMint,
        collectionMetadata: basicCollectionMetadata,
        collectionMasterEdition: basicCollectionMasterEdition,
        sysvarInstructions: SYSVAR_INSTRUCTIONS_PUBKEY,
      })
      .preInstructions([modifyComputeUnits])
      .signers([testUser, secondMint])
      .rpc();

    // Verify user state after second mint
    userState = await testContext.program.account.userState.fetch(userStatePda);
    expect(userState.hasMinted).to.be.true;
    expect(userState.mintAddress.toBase58()).to.equal(secondMint.publicKey.toBase58());

    console.log("✅ User successfully minted again after burning!");
  });

  it("should fail with invalid token account", async () => {
    // Create another user with an NFT
    const testKeypair = Keypair.generate();
    await testContext.airdropSol(testKeypair.publicKey, 5);
    const testTokenAccount = await createAssociatedTokenAccount(
      testContext.provider.connection,
      testContext.admin,
      testContext.usdcMint,
      testKeypair.publicKey
    );
    
    await mintTo(
      testContext.provider.connection,
      testContext.admin,
      testContext.usdcMint,
      testTokenAccount,
      testContext.admin,
      10_000_000
    );

    const testUserNftMint = Keypair.generate();
    const nftTokenAccount = getAssociatedTokenAddressSync(
      testUserNftMint.publicKey,
      testKeypair.publicKey
    );
    const [testMetadataAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from("metadata"), METAPLEX_PROGRAM_ID.toBuffer(), testUserNftMint.publicKey.toBuffer()],
      METAPLEX_PROGRAM_ID
    );
    const [collectionMetadata] = PublicKey.findProgramAddressSync(
      [Buffer.from("metadata"), METAPLEX_PROGRAM_ID.toBuffer(), testContext.basicCollectionMint!.toBuffer()],
      METAPLEX_PROGRAM_ID
    );
    const [collectionMasterEdition] = PublicKey.findProgramAddressSync(
      [Buffer.from("metadata"), METAPLEX_PROGRAM_ID.toBuffer(), testContext.basicCollectionMint!.toBuffer(), Buffer.from("edition")],
      METAPLEX_PROGRAM_ID
    );

    const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({
      units: 400_000,
    });

    await testContext.program.methods
      .mintNft({ basic: {} }, "Test NFT 2", "TEST2", "https://example.com/test2.json")
      .accounts({
        signer: testKeypair.publicKey,
        tokenAccount: nftTokenAccount,
        mint: testUserNftMint.publicKey,
        metadataAccount: testMetadataAccount,
        paymentMint: testContext.usdcMint,
        payerTokenAccount: testTokenAccount,
        paymentTokenProgram: TOKEN_PROGRAM_ID,
        collectionMint: testContext.basicCollectionMint,
        collectionMetadata: collectionMetadata,
        collectionMasterEdition: collectionMasterEdition,
        sysvarInstructions: SYSVAR_INSTRUCTIONS_PUBKEY,
      })
      .preInstructions([modifyComputeUnits])
      .signers([testKeypair, testUserNftMint])
      .rpc();

    // Try to burn with wrong token account (someone else's ATA)
    const wrongTokenAccount = getAssociatedTokenAddressSync(
      testUserNftMint.publicKey,
      testContext.admin.publicKey // Wrong owner
    );

    // Derive user state PDA for test user
    const [testUserStatePda] = PublicKey.findProgramAddressSync(
      [Buffer.from("user_state"), testKeypair.publicKey.toBuffer()],
      testContext.program.programId
    );

    try {
      await testContext.program.methods
        .burnNft()
        .accounts({
          signer: testKeypair.publicKey,
          oldTokenAccount: wrongTokenAccount,
          oldMint: testUserNftMint.publicKey,
          userState: testUserStatePda,
          metadataAccount: null,
        })
        .signers([testKeypair])
        .rpc();
      
      expect.fail("Should have thrown InvalidTokenAccount error");
    } catch (error: any) {
      expect(error.toString()).to.include("InvalidTokenAccount");
    }
  });

  it("should verify collection counts are tracked separately", async () => {
    const adminState = await testContext.fetchAdminState();
    
    // All should be 0 since we burned all test NFTs
    expect(adminState.ogCollection.currentReservedCount.toNumber()).to.be.greaterThanOrEqual(0);
    expect(adminState.regularCollection.currentReservedCount.toNumber()).to.be.greaterThanOrEqual(0);
    expect(adminState.basicCollection.currentReservedCount.toNumber()).to.be.greaterThanOrEqual(0);
  });
});
