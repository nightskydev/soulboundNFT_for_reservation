use anchor_lang::prelude::*;
use anchor_spl::{
    token::{Token, Mint, TokenAccount, MintTo, mint_to},
    associated_token::AssociatedToken,
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
    pub associated_token_program: Program<'info, AssociatedToken>,
    
    #[account(
        init,
        payer = signer,
        mint::decimals = 0,
        mint::authority = admin_state,
        mint::freeze_authority = admin_state,
    )]
    pub collection_mint: Box<Account<'info, Mint>>,
    
    /// Token account to hold the 1 collection NFT (required for master edition)
    #[account(
        init,
        payer = signer,
        associated_token::mint = collection_mint,
        associated_token::authority = admin_state,
    )]
    pub collection_token_account: Box<Account<'info, TokenAccount>>,
    
    pub rent: Sysvar<'info, Rent>,

    /// CHECK: Metaplex Token Metadata program - validated by address
    #[account(address = mpl_token_metadata::ID)]
    pub token_metadata_program: UncheckedAccount<'info>,
    
    /// CHECK: Metadata account - validated by Metaplex program during CPI
    #[account(mut)]
    pub metadata_account: UncheckedAccount<'info>,
    
    /// CHECK: Master edition account - validated by Metaplex program during CPI
    #[account(mut)]
    pub master_edition_account: UncheckedAccount<'info>,

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

#[inline(never)]
fn create_metadata<'info>(
    metadata_account: &AccountInfo<'info>,
    collection_mint: &AccountInfo<'info>,
    admin_state: &AccountInfo<'info>,
    signer_account: &AccountInfo<'info>,
    system_program: &AccountInfo<'info>,
    rent: &AccountInfo<'info>,
    name: String,
    symbol: String,
    uri: String,
    signer_seeds: &[&[&[u8]]],
) -> Result<()> {
    let create_metadata_ix = CreateMetadataAccountV3 {
        metadata: metadata_account.key(),
        mint: collection_mint.key(),
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
        collection: None,
        uses: None,
    };

    let args = mpl_token_metadata::instructions::CreateMetadataAccountV3InstructionArgs {
        data,
        is_mutable: true,
        collection_details: Some(mpl_token_metadata::types::CollectionDetails::V1 { size: 0 }),
    };

    let ix = create_metadata_ix.instruction(args);

    invoke_signed(
        &ix,
        &[
            metadata_account.clone(),
            collection_mint.clone(),
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
fn create_master_edition<'info>(
    master_edition_account: &AccountInfo<'info>,
    collection_mint: &AccountInfo<'info>,
    admin_state: &AccountInfo<'info>,
    signer_account: &AccountInfo<'info>,
    metadata_account: &AccountInfo<'info>,
    token_program: &AccountInfo<'info>,
    system_program: &AccountInfo<'info>,
    rent: &AccountInfo<'info>,
    signer_seeds: &[&[&[u8]]],
) -> Result<()> {
    msg!("Creating master edition");
    
    let create_master_edition_ix = CreateMasterEditionV3 {
        edition: master_edition_account.key(),
        mint: collection_mint.key(),
        update_authority: admin_state.key(),
        mint_authority: admin_state.key(),
        payer: signer_account.key(),
        metadata: metadata_account.key(),
        token_program: token_program.key(),
        system_program: system_program.key(),
        rent: Some(rent.key()),
    };

    let master_edition_args = mpl_token_metadata::instructions::CreateMasterEditionV3InstructionArgs {
        max_supply: Some(0), // 0 means no print editions (correct for collection NFT)
    };

    let master_edition_ix = create_master_edition_ix.instruction(master_edition_args);

    invoke_signed(
        &master_edition_ix,
        &[
            master_edition_account.clone(),
            collection_mint.clone(),
            admin_state.clone(), // update_authority
            admin_state.clone(), // mint_authority
            signer_account.clone(), // payer
            metadata_account.clone(),
            token_program.clone(),
            system_program.clone(),
            rent.clone(),
        ],
        signer_seeds,
    )?;
    
    msg!("Master edition created successfully");

    Ok(())
}

pub fn handler(ctx: Context<CreateCollectionNft>, name: String, symbol: String, uri: String) -> Result<()> {
    msg!("Create collection NFT");

    let bump = ctx.bumps.admin_state;
    let signer_seeds: &[&[&[u8]]] = &[&[b"admin_state", &[bump]]];

    // Create collection metadata
    create_metadata(
        &ctx.accounts.metadata_account.to_account_info(),
        &ctx.accounts.collection_mint.to_account_info(),
        &ctx.accounts.admin_state.to_account_info(),
        &ctx.accounts.signer.to_account_info(),
        &ctx.accounts.system_program.to_account_info(),
        &ctx.accounts.rent.to_account_info(),
        name.clone(),
        symbol.clone(),
        uri.clone(),
        signer_seeds,
    )?;

    // Mint exactly 1 token to the collection token account
    msg!("Minting 1 token to collection token account");
    let cpi_accounts = MintTo {
        mint: ctx.accounts.collection_mint.to_account_info(),
        to: ctx.accounts.collection_token_account.to_account_info(),
        authority: ctx.accounts.admin_state.to_account_info(),
    };
    let cpi_program = ctx.accounts.token_program.to_account_info();
    let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds);
    mint_to(cpi_ctx, 1)?;

    // Create master edition
    create_master_edition(
        &ctx.accounts.master_edition_account.to_account_info(),
        &ctx.accounts.collection_mint.to_account_info(),
        &ctx.accounts.admin_state.to_account_info(),
        &ctx.accounts.signer.to_account_info(),
        &ctx.accounts.metadata_account.to_account_info(),
        &ctx.accounts.token_program.to_account_info(),
        &ctx.accounts.system_program.to_account_info(),
        &ctx.accounts.rent.to_account_info(),
        signer_seeds,
    )?;

    // Store collection info
    let clock = Clock::get()?;
    ctx.accounts.collection_state.collection_mint = ctx.accounts.collection_mint.key();
    ctx.accounts.collection_state.name = name.clone();
    ctx.accounts.collection_state.symbol = symbol.clone();
    ctx.accounts.collection_state.uri = uri.clone();
    ctx.accounts.collection_state.created_at = clock.unix_timestamp;
    ctx.accounts.collection_state.is_verified = true;

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
