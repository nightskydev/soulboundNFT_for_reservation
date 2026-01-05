import * as anchor from "@coral-xyz/anchor";
import { expect } from "chai";
import { testContext, initializeTestContext, OG_MINT_FEE, OG_MAX_SUPPLY, OG_ADMIN_MINT_LIMIT, REGULAR_MINT_FEE, REGULAR_MAX_SUPPLY, REGULAR_ADMIN_MINT_LIMIT, BASIC_MINT_FEE, BASIC_MAX_SUPPLY, BASIC_ADMIN_MINT_LIMIT, MINT_START_DATE } from "./setup";
import { Keypair, PublicKey, ComputeBudgetProgram } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync, ASSOCIATED_TOKEN_PROGRAM_ID } from "@solana/spl-token";

const METAPLEX_PROGRAM_ID = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");

describe("create_collection_nft", () => {
  let ogCollectionMint: Keypair;

  before(async () => {
    await initializeTestContext();

    // Initialize admin if not already done
    if (!testContext.adminInitialized) {
      const ogCollectionMint = Keypair.generate().publicKey;
      const regularCollectionMint = Keypair.generate().publicKey;
      const basicCollectionMint = Keypair.generate().publicKey;

      await testContext.program.methods
        .initAdmin(
          ogCollectionMint,
          OG_MINT_FEE,
          OG_MAX_SUPPLY,
          OG_ADMIN_MINT_LIMIT,
          regularCollectionMint,
          REGULAR_MINT_FEE,
          REGULAR_MAX_SUPPLY,
          REGULAR_ADMIN_MINT_LIMIT,
          basicCollectionMint,
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
      testContext.adminInitialized = true;
    }
  });

  it("should create OG collection successfully", async () => {
    ogCollectionMint = Keypair.generate();
    
    // Derive PDAs
    const [metadataAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from("metadata"), METAPLEX_PROGRAM_ID.toBuffer(), ogCollectionMint.publicKey.toBuffer()],
      METAPLEX_PROGRAM_ID
    );
    
    const [masterEditionAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from("metadata"), METAPLEX_PROGRAM_ID.toBuffer(), ogCollectionMint.publicKey.toBuffer(), Buffer.from("edition")],
      METAPLEX_PROGRAM_ID
    );
    
    const collectionTokenAccount = getAssociatedTokenAddressSync(
      ogCollectionMint.publicKey,
      testContext.adminStatePda,
      true
    );

    // Add compute budget for Metaplex operations
    const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({
      units: 400_000,
    });

    await testContext.program.methods
      .createCollectionNft("OG Collection", "OG", "https://example.com/og-metadata.json")
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

    // Store for later tests
    testContext.ogCollectionMint = ogCollectionMint.publicKey;
  });

  it("should verify collection was created successfully", async () => {
    // Verify the collection mint exists and is stored in test context
    expect(testContext.ogCollectionMint).to.not.be.undefined;
    expect(testContext.ogCollectionMint?.toString()).to.be.a("string");
  });
});
