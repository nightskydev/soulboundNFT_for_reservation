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
import { TOKEN_PROGRAM_ID, getAccount, createAssociatedTokenAccount, mintTo, getAssociatedTokenAddressSync, ASSOCIATED_TOKEN_PROGRAM_ID } from "@solana/spl-token";

const METAPLEX_PROGRAM_ID = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");
const SYSVAR_INSTRUCTIONS_PUBKEY = new PublicKey("Sysvar1nstructions1111111111111111111111111");

describe("withdraw", () => {
  let ogCollectionMint: PublicKey;

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
      
      const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 });

      // Create OG Collection (needed for withdraw tests)
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
      // Admin already initialized - check if OG collection has proper metadata
      const adminState = await testContext.fetchAdminState();
      const [ogMetadataPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("metadata"), METAPLEX_PROGRAM_ID.toBuffer(), adminState.ogCollection.collectionMint.toBuffer()],
        METAPLEX_PROGRAM_ID
      );
      
      const ogMetadata = await testContext.connection.getAccountInfo(ogMetadataPda);
      if (!ogMetadata) {
        // Need to create proper OG collection NFT
        const ogCollectionMintKeypair = Keypair.generate();
        const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 });

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

        // Update admin state
        await testContext.program.methods
          .updateCollectionMint({ og: {} }, ogCollectionMintKeypair.publicKey)
          .accounts({ superAdmin: testContext.admin.publicKey })
          .signers([testContext.admin])
          .rpc();

        testContext.ogCollectionMint = ogCollectionMintKeypair.publicKey;
      }
    }
    
    ogCollectionMint = testContext.ogCollectionMint!;


    // Update withdraw wallet to admin's public key if different
    const adminState = await testContext.fetchAdminState();
    if (adminState.withdrawWallet.toString() !== testContext.admin.publicKey.toString()) {
      await testContext.program.methods
        .updateWithdrawWallet(testContext.admin.publicKey)
        .accounts({
          superAdmin: testContext.admin.publicKey,
        })
        .signers([testContext.admin])
        .rpc();
    }
  });

  // Helper function to mint an NFT and add funds to vault
  async function mintNftToAddFunds(user: Keypair, userUsdcAccount: PublicKey) {
    const nftMint = Keypair.generate();
    const userNftAccount = getAssociatedTokenAddressSync(nftMint.publicKey, user.publicKey);
    const [nftMetadataPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("metadata"), METAPLEX_PROGRAM_ID.toBuffer(), nftMint.publicKey.toBuffer()],
      METAPLEX_PROGRAM_ID
    );
    const [nftMasterEditionPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("metadata"), METAPLEX_PROGRAM_ID.toBuffer(), nftMint.publicKey.toBuffer(), Buffer.from("edition")],
      METAPLEX_PROGRAM_ID
    );
    const [collectionMetadataPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("metadata"), METAPLEX_PROGRAM_ID.toBuffer(), ogCollectionMint.toBuffer()],
      METAPLEX_PROGRAM_ID
    );
    const [collectionMasterEditionPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("metadata"), METAPLEX_PROGRAM_ID.toBuffer(), ogCollectionMint.toBuffer(), Buffer.from("edition")],
      METAPLEX_PROGRAM_ID
    );

    await testContext.program.methods
      .mintNft({ og: {} }, "Test NFT", "TEST", "https://example.com/nft.json")
      .accounts({
        signer: user.publicKey,
        mint: nftMint.publicKey,
        paymentMint: testContext.usdcMint,
        payerTokenAccount: userUsdcAccount,
        paymentTokenProgram: TOKEN_PROGRAM_ID,
        collectionMint: ogCollectionMint,
        collectionMetadata: collectionMetadataPda,
        collectionMasterEdition: collectionMasterEditionPda,
      })
      .preInstructions([
        ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 })
      ])
      .signers([user, nftMint])
      .rpc();
  }

  it("should withdraw specific amount successfully", async () => {
    // First, add some funds to the vault by minting an NFT
    const tempUser = Keypair.generate();
    await testContext.connection.confirmTransaction(
      await testContext.connection.requestAirdrop(tempUser.publicKey, 5 * anchor.web3.LAMPORTS_PER_SOL)
    );

    const tempUserUsdcAccount = await createAssociatedTokenAccount(
      testContext.connection,
      testContext.admin,
      testContext.usdcMint,
      tempUser.publicKey
    );

    await mintTo(
      testContext.connection,
      testContext.admin,
      testContext.usdcMint,
      tempUserUsdcAccount,
      testContext.admin,
      100000000 // 100 USDC
    );

    // Mint an NFT to add funds to vault
    await mintNftToAddFunds(tempUser, tempUserUsdcAccount);

    // Get vault balance before withdrawal
    const vaultBalanceBefore = await testContext.getVaultBalance();

    // Get admin's withdraw wallet token account balance before
    const adminAccountBefore = await getAccount(testContext.connection, testContext.adminUsdcAccount);
    const adminBalanceBefore = adminAccountBefore.amount;

    // Withdraw half of the vault balance
    const withdrawAmount = vaultBalanceBefore / BigInt(2);
    expect(Number(withdrawAmount)).to.be.greaterThan(0);

    const tx = await testContext.program.methods
      .withdraw(new anchor.BN(withdrawAmount.toString()))
      .accounts({
        superAdmin: testContext.admin.publicKey,
        paymentMint: testContext.usdcMint,
        withdrawTokenAccount: testContext.adminUsdcAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([testContext.admin])
      .rpc();

    expect(tx).to.be.a("string");

    // Verify vault balance decreased
    const vaultBalanceAfter = await testContext.getVaultBalance();
    expect(vaultBalanceAfter).to.equal(vaultBalanceBefore - withdrawAmount);

    // Verify admin received the funds
    const adminAccountAfter = await getAccount(testContext.connection, testContext.adminUsdcAccount);
    const adminBalanceAfter = adminAccountAfter.amount;
    expect(adminBalanceAfter).to.equal(adminBalanceBefore + withdrawAmount);
  });

  it("should withdraw all funds successfully", async () => {
    // First, ensure there's balance in the vault
    const vaultBalanceBefore = await testContext.getVaultBalance();

    if (vaultBalanceBefore === BigInt(0)) {
      // Add some funds if vault is empty
      const tempUser = Keypair.generate();
      await testContext.connection.confirmTransaction(
        await testContext.connection.requestAirdrop(tempUser.publicKey, 5 * anchor.web3.LAMPORTS_PER_SOL)
      );

      const tempUserUsdcAccount = await createAssociatedTokenAccount(
        testContext.connection,
        testContext.admin,
        testContext.usdcMint,
        tempUser.publicKey
      );

      await mintTo(
        testContext.connection,
        testContext.admin,
        testContext.usdcMint,
        tempUserUsdcAccount,
        testContext.admin,
        50000000 // 50 USDC
      );

      await mintNftToAddFunds(tempUser, tempUserUsdcAccount);
    }

    // Get balances before withdrawal
    const vaultBalanceBeforeWithdraw = await testContext.getVaultBalance();

    const adminAccountBefore = await getAccount(testContext.connection, testContext.adminUsdcAccount);
    const adminBalanceBefore = adminAccountBefore.amount;

    expect(Number(vaultBalanceBeforeWithdraw)).to.be.greaterThan(0);

    // Withdraw all funds
    const tx = await testContext.program.methods
      .withdrawAll()
      .accounts({
        superAdmin: testContext.admin.publicKey,
        paymentMint: testContext.usdcMint,
        withdrawTokenAccount: testContext.adminUsdcAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([testContext.admin])
      .rpc();

    expect(tx).to.be.a("string");

    // Verify vault is now empty
    const vaultBalanceAfter = await testContext.getVaultBalance();
    expect(Number(vaultBalanceAfter)).to.equal(0);

    // Verify admin received all the funds
    const adminAccountAfter = await getAccount(testContext.connection, testContext.adminUsdcAccount);
    const adminBalanceAfter = adminAccountAfter.amount;
    expect(adminBalanceAfter).to.equal(adminBalanceBefore + vaultBalanceBeforeWithdraw);
  });

  it("should fail to withdraw when vault has insufficient balance", async () => {
    // Try to withdraw more than vault balance
    const vaultBalance = await testContext.getVaultBalance();
    const withdrawAmount = vaultBalance + BigInt(1000000); // More than available

    try {
      await testContext.program.methods
        .withdraw(new anchor.BN(withdrawAmount.toString()))
        .accounts({
          superAdmin: testContext.admin.publicKey,
          paymentMint: testContext.usdcMint,
          withdrawTokenAccount: testContext.adminUsdcAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([testContext.admin])
        .rpc();

      expect.fail("Expected transaction to fail with insufficient balance");
    } catch (error: any) {
      expect(error.toString()).to.include("InsufficientVaultBalance");
    }
  });

  it("should fail to withdraw all when vault is empty", async () => {
    // Ensure vault is empty
    const vaultBalance = await testContext.getVaultBalance();
    if (vaultBalance > BigInt(0)) {
      // Withdraw all first
      await testContext.program.methods
        .withdrawAll()
        .accounts({
          superAdmin: testContext.admin.publicKey,
          paymentMint: testContext.usdcMint,
          withdrawTokenAccount: testContext.adminUsdcAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([testContext.admin])
        .rpc();
    }

    // Now try to withdraw all from empty vault
    try {
      await testContext.program.methods
        .withdrawAll()
        .accounts({
          superAdmin: testContext.admin.publicKey,
          paymentMint: testContext.usdcMint,
          withdrawTokenAccount: testContext.adminUsdcAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([testContext.admin])
        .rpc();

      expect.fail("Expected transaction to fail with empty vault");
    } catch (error: any) {
      expect(error.toString()).to.include("InsufficientVaultBalance");
    }
  });

  it("should fail with invalid withdraw amount (zero)", async () => {
    try {
      await testContext.program.methods
        .withdraw(new anchor.BN(0))
        .accounts({
          superAdmin: testContext.admin.publicKey,
          paymentMint: testContext.usdcMint,
          withdrawTokenAccount: testContext.adminUsdcAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([testContext.admin])
        .rpc();

      expect.fail("Expected transaction to fail with invalid withdraw amount");
    } catch (error: any) {
      expect(error.toString()).to.include("InvalidWithdrawAmount");
    }
  });

  it("should fail when non-admin tries to withdraw", async () => {
    // Add some funds to vault first
    const tempUser = Keypair.generate();
    await testContext.connection.confirmTransaction(
      await testContext.connection.requestAirdrop(tempUser.publicKey, 5 * anchor.web3.LAMPORTS_PER_SOL)
    );

    const tempUserUsdcAccount = await createAssociatedTokenAccount(
      testContext.connection,
      testContext.admin,
      testContext.usdcMint,
      tempUser.publicKey
    );

    await mintTo(
      testContext.connection,
      testContext.admin,
      testContext.usdcMint,
      tempUserUsdcAccount,
      testContext.admin,
      50000000 // 50 USDC
    );

    await mintNftToAddFunds(tempUser, tempUserUsdcAccount);

    // Try to withdraw with non-admin user
    try {
      await testContext.program.methods
        .withdraw(new anchor.BN(1000000))
        .accounts({
          superAdmin: testContext.user1.keypair.publicKey, // Non-admin
          paymentMint: testContext.usdcMint,
          withdrawTokenAccount: testContext.user1.tokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([testContext.user1.keypair])
        .rpc();

      expect.fail("Expected transaction to fail with non-admin signer");
    } catch (error: any) {
      expect(error.toString()).to.include("Unauthorized");
    }
  });
});
