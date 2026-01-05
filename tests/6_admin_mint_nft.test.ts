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
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";

const METAPLEX_PROGRAM_ID = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");
const SYSVAR_INSTRUCTIONS_PUBKEY = new PublicKey("Sysvar1nstructions1111111111111111111111111");

describe("admin_mint_nft", () => {
  let adminMintRecipient1: Keypair;
  let adminMintRecipient2: Keypair;
  let adminMintRecipient3: Keypair;
  let ogNftMint: Keypair;
  let regularNftMint: Keypair;
  let basicNftMint: Keypair;

  before(async () => {
    await initializeTestContext();

    // Initialize admin if not already done
    if (!testContext.adminInitialized) {
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
      
      // Create collection NFTs
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
    }

    // Create recipients
    adminMintRecipient1 = Keypair.generate();
    adminMintRecipient2 = Keypair.generate();
    adminMintRecipient3 = Keypair.generate();

    // Airdrop SOL to recipients for account rent
    await testContext.airdropSol(adminMintRecipient1.publicKey, 1);
    await testContext.airdropSol(adminMintRecipient2.publicKey, 1);
    await testContext.airdropSol(adminMintRecipient3.publicKey, 1);
  });

  it("should admin mint OG NFT to recipient successfully", async () => {
    const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 });

    ogNftMint = Keypair.generate();
    const recipientTokenAccount = getAssociatedTokenAddressSync(
      ogNftMint.publicKey,
      adminMintRecipient1.publicKey
    );
    const [metadataAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from("metadata"), METAPLEX_PROGRAM_ID.toBuffer(), ogNftMint.publicKey.toBuffer()],
      METAPLEX_PROGRAM_ID
    );
    const [collectionMetadata] = PublicKey.findProgramAddressSync(
      [Buffer.from("metadata"), METAPLEX_PROGRAM_ID.toBuffer(), testContext.ogCollectionMint!.toBuffer()],
      METAPLEX_PROGRAM_ID
    );
    const [collectionMasterEdition] = PublicKey.findProgramAddressSync(
      [Buffer.from("metadata"), METAPLEX_PROGRAM_ID.toBuffer(), testContext.ogCollectionMint!.toBuffer(), Buffer.from("edition")],
      METAPLEX_PROGRAM_ID
    );

    // Derive recipient user state PDA
    const [recipientUserStatePda] = PublicKey.findProgramAddressSync(
      [Buffer.from("user_state"), adminMintRecipient1.publicKey.toBuffer()],
      testContext.program.programId
    );

    // Get admin state before
    const adminStateBefore = await testContext.fetchAdminState();
    const ogCountBefore = adminStateBefore.ogCollection.currentReservedCount.toNumber();
    const adminMintCountBefore = adminStateBefore.ogCollection.currentAdminMintCount.toNumber();

    await testContext.program.methods
      .adminMintNft({ og: {} }, "Admin OG NFT", "ADMINOG", "https://example.com/admin-og.json")
      .accounts({
        admin: testContext.admin.publicKey,
        recipient: adminMintRecipient1.publicKey,
        recipientTokenAccount: recipientTokenAccount,
        mint: ogNftMint.publicKey,
        metadataAccount: metadataAccount,
        collectionMint: testContext.ogCollectionMint,
        collectionMetadata: collectionMetadata,
        collectionMasterEdition: collectionMasterEdition,
        sysvarInstructions: SYSVAR_INSTRUCTIONS_PUBKEY,
        recipientUserState: recipientUserStatePda,
      })
      .preInstructions([modifyComputeUnits])
      .signers([testContext.admin, ogNftMint])
      .rpc();

    // Verify counts increased
    const adminStateAfter = await testContext.fetchAdminState();
    expect(adminStateAfter.ogCollection.currentReservedCount.toNumber()).to.equal(ogCountBefore + 1);
    expect(adminStateAfter.ogCollection.currentAdminMintCount.toNumber()).to.equal(adminMintCountBefore + 1);

    // Verify recipient user state was initialized
    const recipientUserState = await testContext.program.account.userState.fetch(recipientUserStatePda);
    expect(recipientUserState.user.toBase58()).to.equal(adminMintRecipient1.publicKey.toBase58());
    expect(recipientUserState.hasMinted).to.be.true;
    expect(recipientUserState.mintAddress.toBase58()).to.equal(ogNftMint.publicKey.toBase58());
    expect(recipientUserState.collectionType).to.deep.equal({ og: {} });

    console.log("✅ Admin minted OG NFT and recipient user state initialized");
  });

  it("should fail to admin mint Regular NFT (admin limit is 0)", async () => {
    const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 });

    regularNftMint = Keypair.generate();
    const recipientTokenAccount = getAssociatedTokenAddressSync(
      regularNftMint.publicKey,
      adminMintRecipient2.publicKey
    );
    const [metadataAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from("metadata"), METAPLEX_PROGRAM_ID.toBuffer(), regularNftMint.publicKey.toBuffer()],
      METAPLEX_PROGRAM_ID
    );
    const [collectionMetadata] = PublicKey.findProgramAddressSync(
      [Buffer.from("metadata"), METAPLEX_PROGRAM_ID.toBuffer(), testContext.regularCollectionMint!.toBuffer()],
      METAPLEX_PROGRAM_ID
    );
    const [collectionMasterEdition] = PublicKey.findProgramAddressSync(
      [Buffer.from("metadata"), METAPLEX_PROGRAM_ID.toBuffer(), testContext.regularCollectionMint!.toBuffer(), Buffer.from("edition")],
      METAPLEX_PROGRAM_ID
    );

    // Derive recipient user state PDA
    const [recipientUserStatePda] = PublicKey.findProgramAddressSync(
      [Buffer.from("user_state"), adminMintRecipient2.publicKey.toBuffer()],
      testContext.program.programId
    );

    try {
      await testContext.program.methods
        .adminMintNft({ regular: {} }, "Admin Regular NFT", "ADMINREG", "https://example.com/admin-reg.json")
        .accounts({
          admin: testContext.admin.publicKey,
          recipient: adminMintRecipient2.publicKey,
          recipientTokenAccount: recipientTokenAccount,
          mint: regularNftMint.publicKey,
          metadataAccount: metadataAccount,
          collectionMint: testContext.regularCollectionMint,
          collectionMetadata: collectionMetadata,
          collectionMasterEdition: collectionMasterEdition,
          sysvarInstructions: SYSVAR_INSTRUCTIONS_PUBKEY,
          recipientUserState: recipientUserStatePda,
        })
        .preInstructions([modifyComputeUnits])
        .signers([testContext.admin, regularNftMint])
        .rpc();
      
      expect.fail("Should have thrown AdminMintLimitReached error");
    } catch (error: any) {
      expect(error.toString()).to.include("AdminMintLimitReached");
      console.log("✅ Correctly prevented admin mint for Regular collection (limit is 0)");
    }
  });

  it("should fail to admin mint Basic NFT (admin limit is 0)", async () => {
    const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 });

    basicNftMint = Keypair.generate();
    const recipientTokenAccount = getAssociatedTokenAddressSync(
      basicNftMint.publicKey,
      adminMintRecipient3.publicKey
    );
    const [metadataAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from("metadata"), METAPLEX_PROGRAM_ID.toBuffer(), basicNftMint.publicKey.toBuffer()],
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

    // Derive recipient user state PDA
    const [recipientUserStatePda] = PublicKey.findProgramAddressSync(
      [Buffer.from("user_state"), adminMintRecipient3.publicKey.toBuffer()],
      testContext.program.programId
    );

    try {
      await testContext.program.methods
        .adminMintNft({ basic: {} }, "Admin Basic NFT", "ADMINBASIC", "https://example.com/admin-basic.json")
        .accounts({
          admin: testContext.admin.publicKey,
          recipient: adminMintRecipient3.publicKey,
          recipientTokenAccount: recipientTokenAccount,
          mint: basicNftMint.publicKey,
          metadataAccount: metadataAccount,
          collectionMint: testContext.basicCollectionMint,
          collectionMetadata: collectionMetadata,
          collectionMasterEdition: collectionMasterEdition,
          sysvarInstructions: SYSVAR_INSTRUCTIONS_PUBKEY,
          recipientUserState: recipientUserStatePda,
        })
        .preInstructions([modifyComputeUnits])
        .signers([testContext.admin, basicNftMint])
        .rpc();
      
      expect.fail("Should have thrown AdminMintLimitReached error");
    } catch (error: any) {
      expect(error.toString()).to.include("AdminMintLimitReached");
      console.log("✅ Correctly prevented admin mint for Basic collection (limit is 0)");
    }
  });

  it("should prevent recipient from minting again after receiving admin mint", async () => {
    // Try to have recipient1 mint their own NFT after receiving one from admin
    const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 });

    // Give recipient1 some USDC for minting
    const { createAssociatedTokenAccount, mintTo } = await import("@solana/spl-token");
    const recipientTokenAccount = await createAssociatedTokenAccount(
      testContext.provider.connection,
      testContext.admin,
      testContext.usdcMint,
      adminMintRecipient1.publicKey
    );
    await mintTo(
      testContext.provider.connection,
      testContext.admin,
      testContext.usdcMint,
      recipientTokenAccount,
      testContext.admin,
      10_000_000 // 10 USDC
    );

    const newMint = Keypair.generate();
    const newTokenAccount = getAssociatedTokenAddressSync(
      newMint.publicKey,
      adminMintRecipient1.publicKey
    );
    const [metadataAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from("metadata"), METAPLEX_PROGRAM_ID.toBuffer(), newMint.publicKey.toBuffer()],
      METAPLEX_PROGRAM_ID
    );
    const [collectionMetadata] = PublicKey.findProgramAddressSync(
      [Buffer.from("metadata"), METAPLEX_PROGRAM_ID.toBuffer(), testContext.ogCollectionMint!.toBuffer()],
      METAPLEX_PROGRAM_ID
    );
    const [collectionMasterEdition] = PublicKey.findProgramAddressSync(
      [Buffer.from("metadata"), METAPLEX_PROGRAM_ID.toBuffer(), testContext.ogCollectionMint!.toBuffer(), Buffer.from("edition")],
      METAPLEX_PROGRAM_ID
    );

    try {
      await testContext.program.methods
        .mintNft({ og: {} }, "Should Fail", "FAIL", "https://example.com/fail.json")
        .accounts({
          signer: adminMintRecipient1.publicKey,
          tokenAccount: newTokenAccount,
          mint: newMint.publicKey,
          metadataAccount: metadataAccount,
          paymentMint: testContext.usdcMint,
          payerTokenAccount: recipientTokenAccount,
          paymentTokenProgram: TOKEN_PROGRAM_ID,
          collectionMint: testContext.ogCollectionMint,
          collectionMetadata: collectionMetadata,
          collectionMasterEdition: collectionMasterEdition,
          sysvarInstructions: SYSVAR_INSTRUCTIONS_PUBKEY,
        })
        .preInstructions([modifyComputeUnits])
        .signers([adminMintRecipient1, newMint])
        .rpc();
      
      expect.fail("Should have thrown UserAlreadyMinted error");
    } catch (error: any) {
      expect(error.toString()).to.include("UserAlreadyMinted");
      console.log("✅ Correctly prevented recipient from minting after receiving admin mint");
    }
  });

  it("should prevent admin from minting to same recipient twice", async () => {
    const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 });

    const duplicateMint = Keypair.generate();
    const recipientTokenAccount = getAssociatedTokenAddressSync(
      duplicateMint.publicKey,
      adminMintRecipient1.publicKey
    );
    const [metadataAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from("metadata"), METAPLEX_PROGRAM_ID.toBuffer(), duplicateMint.publicKey.toBuffer()],
      METAPLEX_PROGRAM_ID
    );
    const [collectionMetadata] = PublicKey.findProgramAddressSync(
      [Buffer.from("metadata"), METAPLEX_PROGRAM_ID.toBuffer(), testContext.ogCollectionMint!.toBuffer()],
      METAPLEX_PROGRAM_ID
    );
    const [collectionMasterEdition] = PublicKey.findProgramAddressSync(
      [Buffer.from("metadata"), METAPLEX_PROGRAM_ID.toBuffer(), testContext.ogCollectionMint!.toBuffer(), Buffer.from("edition")],
      METAPLEX_PROGRAM_ID
    );
    const [recipientUserStatePda] = PublicKey.findProgramAddressSync(
      [Buffer.from("user_state"), adminMintRecipient1.publicKey.toBuffer()],
      testContext.program.programId
    );

    try {
      await testContext.program.methods
        .adminMintNft({ og: {} }, "Duplicate", "DUP", "https://example.com/dup.json")
        .accounts({
          admin: testContext.admin.publicKey,
          recipient: adminMintRecipient1.publicKey,
          recipientTokenAccount: recipientTokenAccount,
          mint: duplicateMint.publicKey,
          metadataAccount: metadataAccount,
          collectionMint: testContext.ogCollectionMint,
          collectionMetadata: collectionMetadata,
          collectionMasterEdition: collectionMasterEdition,
          sysvarInstructions: SYSVAR_INSTRUCTIONS_PUBKEY,
          recipientUserState: recipientUserStatePda,
        })
        .preInstructions([modifyComputeUnits])
        .signers([testContext.admin, duplicateMint])
        .rpc();
      
      expect.fail("Should have thrown UserAlreadyMinted error");
    } catch (error: any) {
      expect(error.toString()).to.include("UserAlreadyMinted");
      console.log("✅ Correctly prevented admin from minting to same recipient twice");
    }
  });

  it("should fail when non-admin tries to admin mint", async () => {
    const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 });
    const nonAdmin = Keypair.generate();
    await testContext.airdropSol(nonAdmin.publicKey, 2);

    const newRecipient = Keypair.generate();
    await testContext.airdropSol(newRecipient.publicKey, 1);

    const newMint = Keypair.generate();
    const recipientTokenAccount = getAssociatedTokenAddressSync(
      newMint.publicKey,
      newRecipient.publicKey
    );
    const [metadataAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from("metadata"), METAPLEX_PROGRAM_ID.toBuffer(), newMint.publicKey.toBuffer()],
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
    const [recipientUserStatePda] = PublicKey.findProgramAddressSync(
      [Buffer.from("user_state"), newRecipient.publicKey.toBuffer()],
      testContext.program.programId
    );

    try {
      await testContext.program.methods
        .adminMintNft({ basic: {} }, "Unauthorized", "UNAUTH", "https://example.com/unauth.json")
        .accounts({
          admin: nonAdmin.publicKey,
          recipient: newRecipient.publicKey,
          recipientTokenAccount: recipientTokenAccount,
          mint: newMint.publicKey,
          metadataAccount: metadataAccount,
          collectionMint: testContext.basicCollectionMint,
          collectionMetadata: collectionMetadata,
          collectionMasterEdition: collectionMasterEdition,
          sysvarInstructions: SYSVAR_INSTRUCTIONS_PUBKEY,
          recipientUserState: recipientUserStatePda,
        })
        .preInstructions([modifyComputeUnits])
        .signers([nonAdmin, newMint])
        .rpc();
      
      expect.fail("Should have thrown Unauthorized error");
    } catch (error: any) {
      expect(error.toString()).to.include("Unauthorized");
    }
  });
});

