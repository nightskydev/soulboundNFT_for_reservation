use anchor_lang::prelude::*;
use anchor_spl::{
    token::{Token, Mint},
};
use mpl_token_metadata::{
    instructions::{CreateMetadataAccountV3, CreateMasterEditionV3},
    types::{DataV2, Creator},
};
use solana_program::program::invoke_signed;

use crate::state::*;

// Event definition
#[event]
pub struct CreateCollectionEvent {
    pub collection_mint: Pubkey,
    pub name: String,
    pub symbol: String,
    pub uri: String,
    pub timestamp: i64,
}

#[derive(Accounts)]
pub struct CreateCollectionNft<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    #[account(
        init,
        payer = signer,
        mint::decimals = 0,
        mint::authority = admin_state,
        mint::freeze_authority = admin_state,
    )]
    pub collection_mint: Account<'info, Mint>,
    pub rent: Sysvar<'info, Rent>,

    /// CHECK: Metaplex Token Metadata program
    pub token_metadata_program: AccountInfo<'info>,
    /// CHECK: Metadata account for the collection
    #[account(
        mut,
        seeds = [b"metadata", token_metadata_program.key().as_ref(), collection_mint.key().as_ref()],
        bump,
        seeds::program = token_metadata_program.key(),
    )]
    pub metadata_account: AccountInfo<'info>,
    /// CHECK: Master edition account for the collection
    #[account(
        mut,
        seeds = [b"metadata", token_metadata_program.key().as_ref(), collection_mint.key().as_ref(), b"edition"],
        bump,
        seeds::program = token_metadata_program.key(),
    )]
    pub master_edition_account: AccountInfo<'info>,

    /// CHECK: The collection state PDA to track collection info
    #[account(
        init,
        seeds = [b"collection".as_ref(), collection_mint.key().as_ref()],
        bump,
        payer = signer,
        space = CollectionState::space()
    )]
    pub collection_state: Box<Account<'info, CollectionState>>,

    #[account(
        mut,
        seeds = [b"admin_state".as_ref()],
        bump,
    )]
    pub admin_state: Box<Account<'info, AdminState>>,
}

pub fn handler(ctx: Context<CreateCollectionNft>, name: String, symbol: String, uri: String) -> Result<()> {
    msg!("Create collection NFT");

    // Collection mint is already initialized by the init constraint above

    // Create metadata and master edition for the collection
    let seeds = b"admin_state";
    let bump = ctx.bumps.admin_state;
    let signer: &[&[&[u8]]] = &[&[seeds, &[bump]]];

    // Create collection metadata
    let create_metadata_ix = CreateMetadataAccountV3 {
        metadata: ctx.accounts.metadata_account.key(),
        mint: ctx.accounts.collection_mint.key(),
        mint_authority: ctx.accounts.admin_state.key(),
        update_authority: (ctx.accounts.admin_state.key(), true),
        payer: ctx.accounts.signer.key(),
        system_program: ctx.accounts.system_program.key(),
        rent: Some(ctx.accounts.rent.key()),
    };

    let data = DataV2 {
        name: name.clone(),
        symbol: symbol.clone(),
        uri: uri.clone(),
        seller_fee_basis_points: 0, // No royalties for collection NFTs
        creators: Some(vec![Creator {
            address: ctx.accounts.admin_state.key(),
            verified: false,
            share: 100,
        }]),
        collection: None, // Collections don't have parent collections
        uses: None,
    };

    let args = mpl_token_metadata::instructions::CreateMetadataAccountV3InstructionArgs {
        data,
        is_mutable: true,
        collection_details: Some(mpl_token_metadata::types::CollectionDetails::V1 { size: 0 }), // Start with 0 items
    };

    let ix = create_metadata_ix.instruction(args);

    invoke_signed(
        &ix,
        &[
            ctx.accounts.metadata_account.to_account_info(),
            ctx.accounts.collection_mint.to_account_info(),
            ctx.accounts.admin_state.to_account_info(),
            ctx.accounts.signer.to_account_info(),
            ctx.accounts.system_program.to_account_info(),
            ctx.accounts.rent.to_account_info(),
        ],
        signer,
    )?;

    // Create master edition for the collection
    let create_master_edition_ix = CreateMasterEditionV3 {
        edition: ctx.accounts.master_edition_account.key(),
        mint: ctx.accounts.collection_mint.key(),
        update_authority: ctx.accounts.admin_state.key(),
        mint_authority: ctx.accounts.admin_state.key(),
        payer: ctx.accounts.signer.key(),
        metadata: ctx.accounts.metadata_account.key(),
        token_program: ctx.accounts.token_program.key(),
        system_program: ctx.accounts.system_program.key(),
        rent: Some(ctx.accounts.rent.key()),
    };

    let master_edition_args = mpl_token_metadata::instructions::CreateMasterEditionV3InstructionArgs {
        max_supply: Some(0), // Unlimited supply for collection items
    };

    let master_edition_ix = create_master_edition_ix.instruction(master_edition_args);

    invoke_signed(
        &master_edition_ix,
        &[
            ctx.accounts.master_edition_account.to_account_info(),
            ctx.accounts.collection_mint.to_account_info(),
            ctx.accounts.admin_state.to_account_info(),
            ctx.accounts.admin_state.to_account_info(),
            ctx.accounts.signer.to_account_info(),
            ctx.accounts.metadata_account.to_account_info(),
            ctx.accounts.token_program.to_account_info(),
            ctx.accounts.system_program.to_account_info(),
            ctx.accounts.rent.to_account_info(),
        ],
        signer,
    )?;


    // Store collection info
    let clock = Clock::get()?;
    ctx.accounts.collection_state.collection_mint = ctx.accounts.collection_mint.key();
    ctx.accounts.collection_state.name = name.clone();
    ctx.accounts.collection_state.symbol = symbol.clone();
    ctx.accounts.collection_state.uri = uri.clone();
    ctx.accounts.collection_state.created_at = clock.unix_timestamp;
    ctx.accounts.collection_state.is_verified = true; // Collection is self-verified

    // Emit event
    emit!(CreateCollectionEvent {
        collection_mint: ctx.accounts.collection_mint.key(),
        name,
        symbol,
        uri,
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}
