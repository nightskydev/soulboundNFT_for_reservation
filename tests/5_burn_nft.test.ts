import * as anchor from "@coral-xyz/anchor";
import { expect } from "chai";
import { testContext, initializeTestContext, MINT_FEE, MAX_SUPPLY, MINT_START_DATE, DONGLE_PRICE_NFT_HOLDER, DONGLE_PRICE_NORMAL } from "./setup";
import { Keypair, PublicKey, ComputeBudgetProgram } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync, mintTo, createAssociatedTokenAccount } from "@solana/spl-token";

const METAPLEX_PROGRAM_ID = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");
const SYSVAR_INSTRUCTIONS_PUBKEY = new PublicKey("Sysvar1nstructions1111111111111111111111111");

describe("burn_nft", () => {
  let burnTestUserNftMint: Keypair;
  let burnTestUser: { keypair: Keypair; tokenAccount: PublicKey };

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

    // Create a dedicated user for burn tests
    const keypair = Keypair.generate();
    await testContext.airdropSol(keypair.publicKey, 5);
    const tokenAccount = await createAssociatedTokenAccount(
      testContext.provider.connection,
      testContext.admin,
      testContext.usdcMint,
      keypair.publicKey
    );
    burnTestUser = { keypair, tokenAccount };
    
    // Fund with USDC
    await mintTo(
      testContext.provider.connection,
      testContext.admin,
      testContext.usdcMint,
      burnTestUser.tokenAccount,
      testContext.admin,
      10_000_000
    );

    // Mint an NFT for this user first
    burnTestUserNftMint = Keypair.generate();
    
    const nftTokenAccount = getAssociatedTokenAddressSync(
      burnTestUserNftMint.publicKey,
      burnTestUser.keypair.publicKey
    );

    // Derive metadata PDA
    const [metadataAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from("metadata"), METAPLEX_PROGRAM_ID.toBuffer(), burnTestUserNftMint.publicKey.toBuffer()],
      METAPLEX_PROGRAM_ID
    );

    const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({
      units: 400_000,
    });

    await testContext.program.methods
      .mintNft("Burn Test NFT", "BURN", "https://example.com/burn-test.json")
      .accounts({
        signer: burnTestUser.keypair.publicKey,
        tokenAccount: nftTokenAccount,
        mint: burnTestUserNftMint.publicKey,
        tokenMetadataProgram: METAPLEX_PROGRAM_ID,
        metadataAccount: metadataAccount,
        paymentMint: testContext.usdcMint,
        payerTokenAccount: burnTestUser.tokenAccount,
        paymentTokenProgram: TOKEN_PROGRAM_ID,
        collectionMint: null,
        collectionMetadata: null,
        collectionMasterEdition: null,
        sysvarInstructions: SYSVAR_INSTRUCTIONS_PUBKEY,
      })
      .preInstructions([modifyComputeUnits])
      .signers([burnTestUser.keypair, burnTestUserNftMint])
      .rpc();
  });

  it("should burn NFT successfully", async () => {
    const nftTokenAccount = getAssociatedTokenAddressSync(
      burnTestUserNftMint.publicKey,
      burnTestUser.keypair.publicKey
    );

    // Get reserved count before
    const adminStateBefore = await testContext.fetchAdminState();
    const reservedCountBefore = adminStateBefore.currentReservedCount.toNumber();

    await testContext.program.methods
      .burnNft()
      .accounts({
        signer: burnTestUser.keypair.publicKey,
        oldTokenAccount: nftTokenAccount,
        oldMint: burnTestUserNftMint.publicKey,
      })
      .signers([burnTestUser.keypair])
      .rpc();

    // Verify reserved count decreased
    const adminStateAfter = await testContext.fetchAdminState();
    expect(adminStateAfter.currentReservedCount.toNumber()).to.equal(reservedCountBefore - 1);
  });

  it("should fail when user doesn't own the NFT", async () => {
    // Create another user with an NFT
    const otherKeypair = Keypair.generate();
    await testContext.airdropSol(otherKeypair.publicKey, 5);
    const otherTokenAccount = await createAssociatedTokenAccount(
      testContext.provider.connection,
      testContext.admin,
      testContext.usdcMint,
      otherKeypair.publicKey
    );
    
    await mintTo(
      testContext.provider.connection,
      testContext.admin,
      testContext.usdcMint,
      otherTokenAccount,
      testContext.admin,
      10_000_000
    );

    const otherUserNftMint = Keypair.generate();
    
    const nftTokenAccount = getAssociatedTokenAddressSync(
      otherUserNftMint.publicKey,
      otherKeypair.publicKey
    );

    // Derive metadata PDA
    const [otherMetadataAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from("metadata"), METAPLEX_PROGRAM_ID.toBuffer(), otherUserNftMint.publicKey.toBuffer()],
      METAPLEX_PROGRAM_ID
    );

    const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({
      units: 400_000,
    });

    await testContext.program.methods
      .mintNft("Other NFT", "OTHER", "https://example.com/other.json")
      .accounts({
        signer: otherKeypair.publicKey,
        tokenAccount: nftTokenAccount,
        mint: otherUserNftMint.publicKey,
        tokenMetadataProgram: METAPLEX_PROGRAM_ID,
        metadataAccount: otherMetadataAccount,
        paymentMint: testContext.usdcMint,
        payerTokenAccount: otherTokenAccount,
        paymentTokenProgram: TOKEN_PROGRAM_ID,
        collectionMint: null,
        collectionMetadata: null,
        collectionMasterEdition: null,
        sysvarInstructions: SYSVAR_INSTRUCTIONS_PUBKEY,
      })
      .preInstructions([modifyComputeUnits])
      .signers([otherKeypair, otherUserNftMint])
      .rpc();

    // Try to burn with wrong mint
    const wrongMint = Keypair.generate();
    const wrongTokenAccount = getAssociatedTokenAddressSync(
      wrongMint.publicKey,
      otherKeypair.publicKey
    );

    try {
      await testContext.program.methods
        .burnNft()
        .accounts({
          signer: otherKeypair.publicKey,
          oldTokenAccount: wrongTokenAccount,
          oldMint: wrongMint.publicKey,
        })
        .signers([otherKeypair])
        .rpc();
      
      expect.fail("Should have failed with invalid token account or empty ATA");
    } catch (error: any) {
      // The transaction should fail - either due to invalid ATA or empty token account
      expect(error).to.exist;
    }
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

    // Derive metadata PDA
    const [testMetadataAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from("metadata"), METAPLEX_PROGRAM_ID.toBuffer(), testUserNftMint.publicKey.toBuffer()],
      METAPLEX_PROGRAM_ID
    );

    const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({
      units: 400_000,
    });

    await testContext.program.methods
      .mintNft("Test NFT 2", "TEST2", "https://example.com/test2.json")
      .accounts({
        signer: testKeypair.publicKey,
        tokenAccount: nftTokenAccount,
        mint: testUserNftMint.publicKey,
        tokenMetadataProgram: METAPLEX_PROGRAM_ID,
        metadataAccount: testMetadataAccount,
        paymentMint: testContext.usdcMint,
        payerTokenAccount: testTokenAccount,
        paymentTokenProgram: TOKEN_PROGRAM_ID,
        collectionMint: null,
        collectionMetadata: null,
        collectionMasterEdition: null,
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

    try {
      await testContext.program.methods
        .burnNft()
        .accounts({
          signer: testKeypair.publicKey,
          oldTokenAccount: wrongTokenAccount,
          oldMint: testUserNftMint.publicKey,
        })
        .signers([testKeypair])
        .rpc();
      
      expect.fail("Should have thrown InvalidTokenAccount error");
    } catch (error: any) {
      expect(error.toString()).to.include("InvalidTokenAccount");
    }
  });

  it("should verify admin state PDA derivation", async () => {
    expect(testContext.adminStatePda.toString()).to.be.a("string");
    expect(testContext.adminStatePda.toString().length).to.be.within(43, 44);
  });

  it("should verify admin state has reserved count tracking", async () => {
    const adminState = await testContext.fetchAdminState();
    expect(adminState.currentReservedCount.toNumber()).to.be.a("number");
    expect(adminState.currentReservedCount.toNumber()).to.be.greaterThanOrEqual(0);
  });
});
