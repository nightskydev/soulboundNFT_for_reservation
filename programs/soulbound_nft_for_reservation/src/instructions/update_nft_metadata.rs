use anchor_lang::prelude::*;
use anchor_spl::token::Mint;
use mpl_token_metadata::{
    instructions::{UpdateV1, UpdateV1InstructionArgs},
    types::{Data, CollectionDetailsToggle, CollectionToggle, Creator, RuleSetToggle, UsesToggle},
};
use solana_program::program::invoke_signed;

use crate::error::ProgramErrorCode;
use crate::state::*;

#[derive(Accounts)]
pub struct UpdateNftMetadata<'info> {
    /// Only the super admin can update NFT metadata
    #[account(mut)]
    pub super_admin: Signer<'info>,
    
    pub system_program: Program<'info, System>,
    
    /// The NFT mint account
    pub mint: Account<'info, Mint>,
    
    /// CHECK: Metaplex Token Metadata program - validated by address
    #[account(address = mpl_token_metadata::ID)]
    pub token_metadata_program: UncheckedAccount<'info>,
    
    /// CHECK: Metadata account - validated by Metaplex program during CPI
    #[account(mut)]
    pub metadata_account: UncheckedAccount<'info>,
    
    #[account(
        mut,
        seeds = [b"admin_state".as_ref()],
        bump,
        constraint = admin_state.super_admin == super_admin.key() @ ProgramErrorCode::Unauthorized
    )]
    pub admin_state: Box<Account<'info, AdminState>>,

    /// CHECK: Sysvar instructions account
    #[account(address = solana_program::sysvar::instructions::ID)]
    pub sysvar_instructions: UncheckedAccount<'info>,
}

pub fn handler(
    ctx: Context<UpdateNftMetadata>,
    name: Option<String>,
    symbol: Option<String>,
    uri: Option<String>,
) -> Result<()> {
    msg!("Update NFT metadata");
    msg!("NFT Mint: {}", ctx.accounts.mint.key());

    let bump = ctx.bumps.admin_state;
    let signer_seeds: &[&[&[u8]]] = &[&[b"admin_state", &[bump]]];

    // Create the new data - all fields required
    let data = Data {
        name: name.clone().ok_or(ProgramErrorCode::InvalidMetadata)?,
        symbol: symbol.clone().ok_or(ProgramErrorCode::InvalidMetadata)?,
        uri: uri.clone().ok_or(ProgramErrorCode::InvalidMetadata)?,
        seller_fee_basis_points: 0,
        creators: Some(vec![Creator {
            address: ctx.accounts.admin_state.key(),
            verified: true,
            share: 100,
        }]),
    };

    // Build the update instruction using UpdateV1
    let update_ix = UpdateV1 {
        authority: ctx.accounts.admin_state.key(),
        delegate_record: None,
        token: None,
        mint: ctx.accounts.mint.key(),
        metadata: ctx.accounts.metadata_account.key(),
        edition: None,
        payer: ctx.accounts.super_admin.key(),
        system_program: ctx.accounts.system_program.key(),
        sysvar_instructions: ctx.accounts.sysvar_instructions.key(),
        authorization_rules_program: None,
        authorization_rules: None,
    };

    let args = UpdateV1InstructionArgs {
        data: Some(data.clone()),
        primary_sale_happened: None,
        is_mutable: None,
        new_update_authority: None,
        authorization_data: None,
        collection_details: CollectionDetailsToggle::None,
        uses: UsesToggle::None,
        collection: CollectionToggle::None,
        rule_set: RuleSetToggle::None,
    };

    let ix = update_ix.instruction(args);

    invoke_signed(
        &ix,
        &[
            ctx.accounts.admin_state.to_account_info(),
            ctx.accounts.mint.to_account_info(),
            ctx.accounts.metadata_account.to_account_info(),
            ctx.accounts.super_admin.to_account_info(),
            ctx.accounts.system_program.to_account_info(),
            ctx.accounts.sysvar_instructions.to_account_info(),
        ],
        signer_seeds,
    )?;

    msg!("NFT metadata updated successfully");
    msg!("  Name: {:?}", data.name);
    msg!("  Symbol: {:?}", data.symbol);
    msg!("  URI: {:?}", data.uri);

    Ok(())
}

