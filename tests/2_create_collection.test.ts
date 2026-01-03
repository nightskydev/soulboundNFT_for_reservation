import * as anchor from "@coral-xyz/anchor";
import { expect } from "chai";
import { testContext, initializeTestContext, MINT_FEE, MAX_SUPPLY, MINT_START_DATE } from "./setup";
import { Keypair, PublicKey, ComputeBudgetProgram } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync, ASSOCIATED_TOKEN_PROGRAM_ID } from "@solana/spl-token";

const METAPLEX_PROGRAM_ID = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");

describe("create_collection_nft", () => {
  let ogCollectionMint: Keypair;

  before(async () => {
    await initializeTestContext();

    // Initialize admin if not already done
    if (!testContext.adminInitialized) {
      await testContext.program.methods
        .initAdmin(
          MINT_FEE,
          MAX_SUPPLY,
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
    
    const [collectionState] = PublicKey.findProgramAddressSync(
      [Buffer.from("collection"), ogCollectionMint.publicKey.toBuffer()],
      testContext.program.programId
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

    // Verify collection state
    const state = await testContext.program.account.collectionState.fetch(collectionState);
    expect(state.collectionMint.toString()).to.equal(ogCollectionMint.publicKey.toString());
    expect(state.name).to.equal("OG Collection");
    expect(state.symbol).to.equal("OG");
    expect(state.isVerified).to.be.true;

    // Store for later tests
    testContext.ogCollectionMint = ogCollectionMint.publicKey;
  });

  it("should verify collection state PDA derivation", async () => {
    const collectionMint = Keypair.generate();
    const [collectionStatePda] = PublicKey.findProgramAddressSync(
      [Buffer.from("collection"), collectionMint.publicKey.toBuffer()],
      testContext.program.programId
    );

    // Just verify the PDA derivation works
    expect(collectionStatePda.toString()).to.be.a("string");
    expect(collectionStatePda.toString().length).to.be.within(43, 44); // Base58 pubkeys are 43-44 chars
  });
});
