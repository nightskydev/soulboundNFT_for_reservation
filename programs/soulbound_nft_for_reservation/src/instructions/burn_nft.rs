use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{self, Token, Burn, CloseAccount},
};
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
    pub old_token_account: UncheckedAccount<'info>,
    /// CHECK: Validated in handler that this matches user_state.nft_address
    #[account(mut)]
    pub old_mint: UncheckedAccount<'info>,
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

pub fn handler(ctx: Context<BurnNft>) -> Result<()> {
    msg!("Burn NFT process started");

    // Validate that user_state is not empty (has an NFT)
    require!(
        ctx.accounts.user_state.nft_address != Pubkey::default(),
        ProgramErrorCode::UserDoesNotOwnNft
    );

    // Validate that the user owns this NFT
    require!(
        ctx.accounts.user_state.nft_address == ctx.accounts.old_mint.key(),
        ProgramErrorCode::UserDoesNotOwnNft
    );

    // Validate that old_token_account is the correct associated token account
    let expected_ata = get_associated_token_address_with_program_id(
        &ctx.accounts.signer.key(),
        &ctx.accounts.old_mint.key(),
        &token_program_id(),
    );
    msg!("Expected ATA: {}", expected_ata);
    msg!("Provided ATA: {}", ctx.accounts.old_token_account.key());
    require!(
        ctx.accounts.old_token_account.key() == expected_ata,
        ProgramErrorCode::InvalidTokenAccount
    );

    // Burn the NFT token (reduces supply to 0)
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
    msg!("NFT token burned");

    // Close the token account and return rent to signer
    token::close_account(CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        CloseAccount {
            account: ctx.accounts.old_token_account.to_account_info(),
            destination: ctx.accounts.signer.to_account_info(),
            authority: ctx.accounts.signer.to_account_info(),
        },
    ))?;
    msg!("Token account closed");

    // Note: SPL Token mints cannot be closed. The mint account remains on-chain
    // with supply = 0. This is standard behavior for NFT burns on Solana.

    // Clear user's NFT address
    ctx.accounts.user_state.nft_address = Pubkey::default();
    
    // Decrement reserved count with underflow protection
    ctx.accounts.admin_state.current_reserved_count = ctx.accounts.admin_state
        .current_reserved_count
        .checked_sub(1)
        .ok_or(ProgramErrorCode::ReservedCountUnderflow)?;
    
    msg!("NFT burn complete. Reserved count: {}", ctx.accounts.admin_state.current_reserved_count);

    Ok(())
}
