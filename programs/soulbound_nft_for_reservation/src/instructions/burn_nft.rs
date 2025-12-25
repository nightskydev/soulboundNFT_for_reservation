use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{self, Token, Burn},
};
use solana_program::program::{invoke, invoke_signed};
use spl_associated_token_account::get_associated_token_address_with_program_id;
use spl_token::id as token_program_id;

use crate::state::*;
use crate::error::ProgramErrorCode;

#[derive(Accounts)]
pub struct BurnNft<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    /// CHECK: Validated in handler that this is the correct ATA
    #[account(mut)]
    pub old_token_account: AccountInfo<'info>,
    /// CHECK: Validated in handler that this matches user_state.nft_address
    #[account(mut)]
    pub old_mint: AccountInfo<'info>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    #[account( 
        mut, 
        seeds = [b"admin_state".as_ref()],
        bump,
    )]
    pub admin_state: Box<Account<'info, AdminState>>,
    #[account(
        mut,
        seeds = [b"user_state".as_ref(), signer.key().as_ref()],
        bump,
    )]
    pub user_state: Box<Account<'info, UserState>>,
}

pub fn handler(
    ctx: Context<BurnNft>,
) -> Result<()> {
    msg!("Burn NFT process started");

    // Validate that the user owns this NFT
    require!(
        ctx.accounts.user_state.nft_address == ctx.accounts.old_mint.key(),
        ProgramErrorCode::UserDoesNotOwnNft
    );

    // Validate that user_state is not empty (has an NFT)
    require!(
        ctx.accounts.user_state.nft_address != Pubkey::default(),
        ProgramErrorCode::UserDoesNotOwnNft
    );

    // Validate that old_token_account is the correct associated token account for regular Token
    let expected_ata = get_associated_token_address_with_program_id(
        &ctx.accounts.signer.key(),
        &ctx.accounts.old_mint.key(),
        &token_program_id(),
    );
    msg!("expected_ata (burn_nft): {:?}", expected_ata.to_string());
    msg!(
        "old_token_account (burn_nft): {:?}",
        ctx.accounts.old_token_account.key().to_string()
    );
    require!(
        ctx.accounts.old_token_account.key() == expected_ata,
        ProgramErrorCode::InvalidTokenAccount
    );

    let seeds = b"admin_state";
    let bump = ctx.bumps.admin_state;
    let signer: &[&[&[u8]]] = &[&[seeds, &[bump]]];

    // burn old token
    token::burn(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Burn {
                mint: ctx.accounts.old_mint.to_account_info(),
                from: ctx.accounts.old_token_account.to_account_info(),
                authority: ctx.accounts.signer.to_account_info(),
            },
        ),
        1,
    )?;

    // Close user account
    invoke(
        &spl_token::instruction::close_account(
            &ctx.accounts.token_program.key(),
            &ctx.accounts.old_token_account.to_account_info().key,
            &ctx.accounts.signer.key,
            &ctx.accounts.signer.key,
            &[],
        )?,
        &[
            ctx.accounts.token_program.to_account_info(),
            ctx.accounts.old_token_account.to_account_info(),
            ctx.accounts.signer.to_account_info(),
            ctx.accounts.signer.to_account_info(),
        ],
    )?;

    // Close mint - for regular tokens, we need to revoke freeze authority first if it exists
    // Then close the mint account
    invoke_signed(
        &spl_token::instruction::close_account(
            &ctx.accounts.token_program.key(),
            &ctx.accounts.old_mint.to_account_info().key,
            &ctx.accounts.signer.key,
            &ctx.accounts.admin_state.key(),
            &[],
        )?,
        &[
            ctx.accounts.token_program.to_account_info(),
            ctx.accounts.old_mint.to_account_info(),
            ctx.accounts.signer.to_account_info(),
            ctx.accounts.admin_state.to_account_info(),
        ],
        signer,
    )?;

    // store user's info - nft address
    ctx.accounts.user_state.nft_address = Pubkey::default();
    
    // Decrement reserved count with underflow protection
    ctx.accounts.admin_state.current_reserved_count = ctx.accounts.admin_state
        .current_reserved_count
        .checked_sub(1)
        .ok_or(ProgramErrorCode::ReservedCountUnderflow)?;

    Ok(())
}
