use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::{self, AssociatedToken},
    token::{self, Token, Mint},
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
pub struct AdminMintNftEvent {
    pub recipient: Pubkey,
    pub mint_address: Pubkey,
    pub admin: Pubkey,
    pub timestamp: i64,
}

#[derive(Accounts)]
pub struct AdminMintNft<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    /// CHECK: The recipient who will receive the NFT
    pub recipient: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,

    /// CHECK: Associated token account for recipient - validated by PDA derivation and created via CPI
    #[account(
        mut,
        seeds = [
            recipient.key().as_ref(),
            token_program.key().as_ref(),
            mint.key().as_ref()
        ],
        bump,
        seeds::program = associated_token_program.key()
    )]
    pub recipient_token_account: UncheckedAccount<'info>,

    #[account(
        init,
        payer = admin,
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
        constraint = admin.key() == admin_state.super_admin @ ProgramErrorCode::Unauthorized
    )]
    pub admin_state: Box<Account<'info, AdminState>>,

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

    // === Recipient User State ===
    /// User state account for the recipient to track if they have already received/minted an NFT
    /// Uses init_if_needed to support re-minting after burn (when account exists but has_minted = false)
    /// Solana's transaction atomicity and account locking prevent race conditions
    #[account(
        init_if_needed,
        payer = admin,
        space = UserState::space(),
        seeds = [b"user_state", recipient.key().as_ref()],
        bump,
        constraint = !recipient_user_state.has_minted @ ProgramErrorCode::UserAlreadyMinted,
    )]
    pub recipient_user_state: Account<'info, UserState>,
}

#[inline(never)]
fn create_nft_metadata<'info>(
    metadata_account: &AccountInfo<'info>,
    mint: &AccountInfo<'info>,
    admin_state: &AccountInfo<'info>,
    admin_account: &AccountInfo<'info>,
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
        payer: admin_account.key(),
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
            admin_account.clone(),
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

pub fn handler(ctx: Context<AdminMintNft>, collection_type: crate::state::CollectionType, name: String, symbol: String, uri: String) -> Result<()> {
    msg!("Admin minting NFT for collection type: {:?} to recipient: {}", collection_type, ctx.accounts.recipient.key());

    // Note: has_minted check is now enforced at account constraint level for better security
    
    // Get the specific collection configuration
    let collection_config = ctx.accounts.admin_state.get_collection_config(collection_type);

    // Check max supply (0 = unlimited)
    let max_supply = collection_config.max_supply;
    if max_supply > 0 {
        require!(
            collection_config.current_reserved_count < max_supply,
            ProgramErrorCode::MaxSupplyReached
        );
    }

    // Check admin mint limit (0 = admin cannot mint any NFTs)
    let admin_mint_limit = collection_config.admin_mint_limit;
    require!(
        collection_config.current_admin_mint_count < admin_mint_limit,
        ProgramErrorCode::AdminMintLimitReached
    );

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
        &ctx.accounts.admin.to_account_info(),
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

    // Create the associated token account for the recipient
    associated_token::create(CpiContext::new(
        ctx.accounts.associated_token_program.to_account_info(),
        associated_token::Create {
            payer: ctx.accounts.admin.to_account_info(),
            associated_token: ctx.accounts.recipient_token_account.to_account_info(),
            authority: ctx.accounts.recipient.to_account_info(), // The recipient owns the token account
            mint: ctx.accounts.mint.to_account_info(),
            system_program: ctx.accounts.system_program.to_account_info(),
            token_program: ctx.accounts.token_program.to_account_info(),
        },
    ))?;

    // Mint one token to the recipient's associated token account
    token::mint_to(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            token::MintTo {
                mint: ctx.accounts.mint.to_account_info(),
                to: ctx.accounts.recipient_token_account.to_account_info(),
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
                account: ctx.accounts.recipient_token_account.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                authority: ctx.accounts.admin_state.to_account_info(),
            },
            signer_seeds,
        ),
    )?;
    msg!("Token account frozen - NFT is now soulbound (non-transferable)");

    // Increment reserved count for the specific collection
    let collection_config_mut = ctx.accounts.admin_state.get_collection_config_mut(collection_type);
    collection_config_mut.current_reserved_count = collection_config_mut
        .current_reserved_count
        .checked_add(1)
        .ok_or(ProgramErrorCode::ReservedCountOverflow)?;

    // Increment admin mint count for the specific collection
    collection_config_mut.current_admin_mint_count = collection_config_mut
        .current_admin_mint_count
        .checked_add(1)
        .ok_or(ProgramErrorCode::ReservedCountOverflow)?;

    msg!(
        "Collection {:?} - Current reserved count: {}, Current admin mint count: {}",
        collection_type,
        collection_config_mut.current_reserved_count,
        collection_config_mut.current_admin_mint_count
    );

    // Initialize/update recipient user state to prevent them from minting another NFT
    let clock = Clock::get()?;
    ctx.accounts.recipient_user_state.set_inner(UserState {
        user: ctx.accounts.recipient.key(),
        has_minted: true,
        collection_type,
        mint_address: ctx.accounts.mint.key(),
        minted_at: clock.unix_timestamp,
        bump: ctx.bumps.recipient_user_state,
    });

    msg!(
        "Recipient user state initialized - recipient {} can no longer mint/receive NFTs",
        ctx.accounts.recipient.key()
    );

    // Emit event
    emit!(AdminMintNftEvent {
        recipient: ctx.accounts.recipient.key(),
        mint_address: ctx.accounts.mint.key(),
        admin: ctx.accounts.admin.key(),
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}
