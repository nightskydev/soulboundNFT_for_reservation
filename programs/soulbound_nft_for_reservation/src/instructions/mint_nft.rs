use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::{self, AssociatedToken},
    token::{self, Token, Mint, transfer_checked, TransferChecked},
    token_interface::{TokenInterface, Mint as InterfaceMint, TokenAccount as InterfaceTokenAccount},
};
use mpl_token_metadata::{
    instructions::{
        CreateMetadataAccountV3, CreateMetadataAccountV3InstructionArgs,
        VerifyCollectionV1, VerifyCreatorV1,
    },
    types::{DataV2, Creator},
};
use solana_program::program::invoke_signed;

use crate::error::ProgramErrorCode;
use crate::state::*;

// Event definition
#[event]
pub struct MintNftEvent {
    pub user: Pubkey,
    pub mint_address: Pubkey,
    pub timestamp: i64,
}

#[derive(Accounts)]
pub struct MintNft<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    
    /// CHECK: Associated token account - validated by PDA derivation and created via CPI
    #[account(
        mut,
        seeds = [
            signer.key().as_ref(),
            token_program.key().as_ref(),
            mint.key().as_ref()
        ],
        bump,
        seeds::program = associated_token_program.key()
    )]
    pub token_account: UncheckedAccount<'info>,
    
    #[account(
        init,
        payer = signer,
        mint::decimals = 0,
        mint::authority = admin_state,
        mint::freeze_authority = admin_state,
    )]
    pub mint: Box<Account<'info, Mint>>,
    
    pub rent: Sysvar<'info, Rent>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    
    /// CHECK: Metaplex Token Metadata program - validated by address
    #[account(address = mpl_token_metadata::ID)]
    pub token_metadata_program: UncheckedAccount<'info>,
    
    /// CHECK: Metadata account - validated by PDA derivation and Metaplex program during CPI
    #[account(
        mut,
        seeds = [
            b"metadata",
            mpl_token_metadata::ID.as_ref(),
            mint.key().as_ref()
        ],
        bump,
        seeds::program = mpl_token_metadata::ID
    )]
    pub metadata_account: UncheckedAccount<'info>,
    
    #[account(
        mut,
        seeds = [b"admin_state".as_ref()],
        bump,
        constraint = admin_state.super_admin != Pubkey::default() @ ProgramErrorCode::AdminNotInitialized,
    )]
    pub admin_state: Box<Account<'info, AdminState>>,
    

    // === Payment token accounts ===
    /// The SPL token mint for payment (e.g., USDC) - must match admin_state.payment_mint
    #[account(
        constraint = payment_mint.key() == admin_state.payment_mint @ ProgramErrorCode::InvalidPaymentMint
    )]
    pub payment_mint: Box<InterfaceAccount<'info, InterfaceMint>>,

    /// Payer's token account for payment
    #[account(
        mut,
        constraint = payer_token_account.mint == payment_mint.key() @ ProgramErrorCode::InvalidPaymentTokenAccount,
        constraint = payer_token_account.owner == signer.key() @ ProgramErrorCode::InvalidPaymentTokenAccount
    )]
    pub payer_token_account: Box<InterfaceAccount<'info, InterfaceTokenAccount>>,

    /// Vault token account (PDA-controlled) to receive payment - created in init_admin
    #[account(
        mut,
        seeds = [b"vault", payment_mint.key().as_ref()],
        bump,
    )]
    pub vault: Box<InterfaceAccount<'info, InterfaceTokenAccount>>,

    /// Token program for payment (can be Token or Token2022)
    pub payment_token_program: Interface<'info, TokenInterface>,

    // === Optional Collection ===
    /// Optional collection mint account for grouping NFTs - validated in handler
    pub collection_mint: Option<Box<Account<'info, Mint>>>,

    /// CHECK: Optional collection metadata account - validated by PDA derivation in handler if provided
    #[account(mut)]
    pub collection_metadata: Option<UncheckedAccount<'info>>,

    /// CHECK: Optional collection master edition account - validated by PDA derivation in handler if provided
    pub collection_master_edition: Option<UncheckedAccount<'info>>,

    /// CHECK: Sysvar instructions account - required for creator and collection verification
    #[account(address = solana_program::sysvar::instructions::ID)]
    pub sysvar_instructions: UncheckedAccount<'info>,

    // === User State ===
    /// User state account to track if wallet has already minted an NFT
    /// Uses init_if_needed to support re-minting after burn (when account exists but has_minted = false)
    /// Solana's transaction atomicity and account locking prevent race conditions
    #[account(
        init_if_needed,
        payer = signer,
        space = UserState::space(),
        seeds = [b"user_state", signer.key().as_ref()],
        bump,
        constraint = !user_state.has_minted @ ProgramErrorCode::UserAlreadyMinted,
    )]
    pub user_state: Account<'info, UserState>,
}

#[inline(never)]
fn create_nft_metadata<'info>(
    metadata_account: &AccountInfo<'info>,
    mint: &AccountInfo<'info>,
    admin_state: &AccountInfo<'info>,
    signer_account: &AccountInfo<'info>,
    system_program: &AccountInfo<'info>,
    rent: &AccountInfo<'info>,
    name: String,
    symbol: String,
    uri: String,
    collection_key: Option<Pubkey>,
    signer_seeds: &[&[&[u8]]],
) -> Result<()> {
    let create_metadata_ix = CreateMetadataAccountV3 {
        metadata: metadata_account.key(),
        mint: mint.key(),
        mint_authority: admin_state.key(),
        update_authority: (admin_state.key(), true),
        payer: signer_account.key(),
        system_program: system_program.key(),
        rent: Some(rent.key()),
    };

    let data = DataV2 {
        name,
        symbol,
        uri,
        seller_fee_basis_points: 0,
        creators: Some(vec![Creator {
            address: admin_state.key(),
            verified: false,
            share: 100,
        }]),
        collection: collection_key.map(|key| mpl_token_metadata::types::Collection {
            verified: false,
            key,
        }),
        uses: None,
    };

    let args = CreateMetadataAccountV3InstructionArgs {
        data,
        is_mutable: true,
        collection_details: None,
    };

    let ix = create_metadata_ix.instruction(args);

    invoke_signed(
        &ix,
        &[
            metadata_account.clone(),
            mint.clone(),
            admin_state.clone(),
            signer_account.clone(),
            system_program.clone(),
            rent.clone(),
        ],
        signer_seeds,
    )?;

    Ok(())
}

#[inline(never)]
fn verify_collection<'info>(
    metadata_account: &AccountInfo<'info>,
    collection_mint: &AccountInfo<'info>,
    collection_metadata: &AccountInfo<'info>,
    collection_master_edition: &AccountInfo<'info>,
    admin_state: &AccountInfo<'info>,
    system_program: &AccountInfo<'info>,
    sysvar_instructions: &AccountInfo<'info>,
    signer_seeds: &[&[&[u8]]],
) -> Result<()> {
    let verify_collection_ix = VerifyCollectionV1 {
        authority: admin_state.key(),
        delegate_record: None,
        metadata: metadata_account.key(),
        collection_mint: collection_mint.key(),
        collection_metadata: Some(collection_metadata.key()),
        collection_master_edition: Some(collection_master_edition.key()),
        system_program: system_program.key(),
        sysvar_instructions: sysvar_instructions.key(),
    };

    let ix = verify_collection_ix.instruction();

    invoke_signed(
        &ix,
        &[
            admin_state.clone(),
            metadata_account.clone(),
            collection_mint.clone(),
            collection_metadata.clone(),
            collection_master_edition.clone(),
            system_program.clone(),
            sysvar_instructions.clone(),
        ],
        signer_seeds,
    )?;

    msg!("Collection verified successfully");
    Ok(())
}

#[inline(never)]
fn verify_creator<'info>(
    metadata_account: &AccountInfo<'info>,
    admin_state: &AccountInfo<'info>,
    system_program: &AccountInfo<'info>,
    sysvar_instructions: &AccountInfo<'info>,
    signer_seeds: &[&[&[u8]]],
) -> Result<()> {
    let verify_creator_ix = VerifyCreatorV1 {
        authority: admin_state.key(),
        delegate_record: None,
        metadata: metadata_account.key(),
        collection_mint: None,
        collection_metadata: None,
        collection_master_edition: None,
        system_program: system_program.key(),
        sysvar_instructions: sysvar_instructions.key(),
    };

    let ix = verify_creator_ix.instruction();

    invoke_signed(
        &ix,
        &[
            admin_state.clone(),
            metadata_account.clone(),
            system_program.clone(),
            sysvar_instructions.clone(),
        ],
        signer_seeds,
    )?;

    msg!("Creator verified successfully");
    Ok(())
}

pub fn handler(ctx: Context<MintNft>, collection_type: crate::state::CollectionType, name: String, symbol: String, uri: String) -> Result<()> {
    msg!("Mint regular NFT with Metaplex metadata for collection type: {:?}", collection_type);

    // Note: has_minted check is now enforced at account constraint level for better security
    
    // Check mint start date (0 = no restriction)
    let mint_start_date = ctx.accounts.admin_state.mint_start_date;
    if mint_start_date > 0 {
        let clock = Clock::get()?;
        require!(clock.unix_timestamp >= mint_start_date, ProgramErrorCode::MintNotStarted);
    }

    // Get the specific collection configuration
    let collection_config = ctx.accounts.admin_state.get_collection_config(collection_type);

    // Check max supply (0 = unlimited)
    let max_supply = collection_config.max_supply;
    if max_supply > 0 {
        require!(collection_config.current_reserved_count < max_supply, ProgramErrorCode::MaxSupplyReached);
    }

    // Validate mint fee
    require!(collection_config.mint_fee > 0, ProgramErrorCode::InvalidMintFee);

    let bump = ctx.bumps.admin_state;
    let signer_seeds: &[&[&[u8]]] = &[&[b"admin_state", &[bump]]];

    // Validate collection accounts if provided
    let collection_key = if let Some(collection_mint) = &ctx.accounts.collection_mint {
        // Validate collection mint properties
        require!(
            collection_mint.key() == collection_config.collection_mint,
            ProgramErrorCode::InvalidCollection
        );
        require!(
            collection_mint.decimals == 0,
            ProgramErrorCode::InvalidCollectionMint
        );
        require!(
            collection_mint.supply == 1,
            ProgramErrorCode::InvalidCollectionMint
        );

        // Validate collection metadata PDA
        let expected_metadata_key = Pubkey::find_program_address(
            &[
                b"metadata",
                &mpl_token_metadata::ID.as_ref(),
                &collection_mint.key().as_ref(),
            ],
            &mpl_token_metadata::ID,
        ).0;
        require!(
            ctx.accounts.collection_metadata.is_some(),
            ProgramErrorCode::InvalidCollectionMetadata
        );
        let collection_metadata = ctx.accounts.collection_metadata.as_ref().unwrap();
        require!(
            collection_metadata.key() == expected_metadata_key,
            ProgramErrorCode::InvalidCollectionMetadata
        );

        // Validate collection master edition PDA
        let expected_master_edition_key = Pubkey::find_program_address(
            &[
                b"metadata",
                &mpl_token_metadata::ID.as_ref(),
                &collection_mint.key().as_ref(),
                b"edition",
            ],
            &mpl_token_metadata::ID,
        ).0;
        require!(
            ctx.accounts.collection_master_edition.is_some(),
            ProgramErrorCode::InvalidCollectionMasterEdition
        );
        let collection_master_edition = ctx.accounts.collection_master_edition.as_ref().unwrap();
        require!(
            collection_master_edition.key() == expected_master_edition_key,
            ProgramErrorCode::InvalidCollectionMasterEdition
        );

        Some(collection_mint.key())
    } else {
        None
    };

    // Create metadata
    create_nft_metadata(
        &ctx.accounts.metadata_account.to_account_info(),
        &ctx.accounts.mint.to_account_info(),
        &ctx.accounts.admin_state.to_account_info(),
        &ctx.accounts.signer.to_account_info(),
        &ctx.accounts.system_program.to_account_info(),
        &ctx.accounts.rent.to_account_info(),
        name,
        symbol,
        uri,
        collection_key,
        signer_seeds,
    )?;

    // Verify creator (admin_state PDA is the creator)
    verify_creator(
        &ctx.accounts.metadata_account.to_account_info(),
        &ctx.accounts.admin_state.to_account_info(),
        &ctx.accounts.system_program.to_account_info(),
        &ctx.accounts.sysvar_instructions.to_account_info(),
        signer_seeds,
    )?;

    // Verify collection if provided
    if let (
        Some(collection_mint),
        Some(collection_metadata),
        Some(collection_master_edition),
    ) = (
        &ctx.accounts.collection_mint,
        &ctx.accounts.collection_metadata,
        &ctx.accounts.collection_master_edition,
    ) {
        verify_collection(
            &ctx.accounts.metadata_account.to_account_info(),
            &collection_mint.to_account_info(),
            &collection_metadata.to_account_info(),
            &collection_master_edition.to_account_info(),
            &ctx.accounts.admin_state.to_account_info(),
            &ctx.accounts.system_program.to_account_info(),
            &ctx.accounts.sysvar_instructions.to_account_info(),
            signer_seeds,
        )?;
    }

    // Create the associated token account
    associated_token::create(CpiContext::new(
        ctx.accounts.associated_token_program.to_account_info(),
        associated_token::Create {
            payer: ctx.accounts.signer.to_account_info(),
            associated_token: ctx.accounts.token_account.to_account_info(),
            authority: ctx.accounts.signer.to_account_info(),
            mint: ctx.accounts.mint.to_account_info(),
            system_program: ctx.accounts.system_program.to_account_info(),
            token_program: ctx.accounts.token_program.to_account_info(),
        },
    ))?;

    // Mint one token to the associated token account
    token::mint_to(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            token::MintTo {
                mint: ctx.accounts.mint.to_account_info(),
                to: ctx.accounts.token_account.to_account_info(),
                authority: ctx.accounts.admin_state.to_account_info(),
            },
            signer_seeds,
        ),
        1,
    )?;

    // **FREEZE THE TOKEN ACCOUNT TO MAKE IT NON-TRANSFERABLE (SOULBOUND)**
    // Once frozen, the token account cannot transfer tokens, making the NFT soulbound
    token::freeze_account(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            token::FreezeAccount {
                account: ctx.accounts.token_account.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                authority: ctx.accounts.admin_state.to_account_info(),
            },
            signer_seeds,
        ),
    )?;
    msg!("Token account frozen - NFT is now soulbound (non-transferable)");

    // ==== EFFECTS: Update state before external interactions (CEI pattern) ====
    
    // Store mint fee before mutable borrow
    let mint_fee = collection_config.mint_fee;
    let payment_decimals = ctx.accounts.payment_mint.decimals;
    
    // Increment reserved count for the specific collection
    let collection_config_mut = ctx.accounts.admin_state.get_collection_config_mut(collection_type);
    collection_config_mut.current_reserved_count = collection_config_mut
        .current_reserved_count
        .checked_add(1)
        .ok_or(ProgramErrorCode::ReservedCountOverflow)?;

    msg!(
        "Collection {:?} - Current reserved count: {}",
        collection_type,
        collection_config_mut.current_reserved_count
    );

    // Initialize user state to prevent further minting
    let clock = Clock::get()?;
    ctx.accounts.user_state.set_inner(UserState {
        user: ctx.accounts.signer.key(),
        has_minted: true,
        collection_type,
        mint_address: ctx.accounts.mint.key(),
        minted_at: clock.unix_timestamp,
        bump: ctx.bumps.user_state,
    });

    msg!("User state initialized - user can no longer mint NFTs");

    // ==== INTERACTIONS: External calls last (CEI pattern) ====
    
    // Transfer payment tokens from payer to vault
    transfer_checked(
        CpiContext::new(
            ctx.accounts.payment_token_program.to_account_info(),
            TransferChecked {
                from: ctx.accounts.payer_token_account.to_account_info(),
                mint: ctx.accounts.payment_mint.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
                authority: ctx.accounts.signer.to_account_info(),
            },
        ),
        mint_fee,
        payment_decimals,
    )?;
    msg!("Payment of {} tokens transferred to vault", mint_fee);

    // Emit event
    emit!(MintNftEvent {
        user: ctx.accounts.signer.key(),
        mint_address: ctx.accounts.mint.key(),
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}
