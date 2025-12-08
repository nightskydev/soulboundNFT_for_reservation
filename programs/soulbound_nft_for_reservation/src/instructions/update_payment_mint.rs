use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

use crate::error::ProgramErrorCode;
use crate::state::*;

/// Update payment mint - requires old vault to be empty first
/// This allows migrating to a new payment token (e.g., from USDC to USDT)
#[derive(Accounts)]
pub struct UpdatePaymentMint<'info> {
    /// Super admin who can update payment mint
    #[account(mut)]
    pub super_admin: Signer<'info>,

    #[account(
        mut,
        seeds = [b"admin_state".as_ref()],
        bump,
        constraint = admin_state.super_admin == super_admin.key() @ ProgramErrorCode::Unauthorized
    )]
    pub admin_state: Box<Account<'info, AdminState>>,

    /// Current payment mint stored in admin_state
    #[account(
        constraint = old_payment_mint.key() == admin_state.payment_mint @ ProgramErrorCode::InvalidPaymentMint,
        mint::token_program = old_payment_token_program
    )]
    pub old_payment_mint: InterfaceAccount<'info, Mint>,

    /// The old vault - must be empty before changing payment mint
    #[account(
        seeds = [b"vault", old_payment_mint.key().as_ref()],
        bump,
        token::mint = old_payment_mint,
        token::authority = admin_state,
        token::token_program = old_payment_token_program,
        constraint = old_vault.amount == 0 @ ProgramErrorCode::VaultNotEmpty
    )]
    pub old_vault: InterfaceAccount<'info, TokenAccount>,

    /// Token program for old payment mint (can be Token or Token2022)
    pub old_payment_token_program: Interface<'info, TokenInterface>,

    /// The new SPL token mint for payment
    #[account(
        mint::token_program = new_payment_token_program
    )]
    pub new_payment_mint: InterfaceAccount<'info, Mint>,

    /// New vault token account (PDA-controlled) to hold payment tokens
    /// Uses init_if_needed to allow switching back to a previously used payment mint
    #[account(
        init_if_needed,
        payer = super_admin,
        seeds = [b"vault", new_payment_mint.key().as_ref()],
        bump,
        token::mint = new_payment_mint,
        token::authority = admin_state,
        token::token_program = new_payment_token_program,
    )]
    pub new_vault: InterfaceAccount<'info, TokenAccount>,

    /// Token program for new payment mint (can be Token or Token2022)
    pub new_payment_token_program: Interface<'info, TokenInterface>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<UpdatePaymentMint>) -> Result<()> {
    let old_mint = ctx.accounts.old_payment_mint.key();
    let new_mint = ctx.accounts.new_payment_mint.key();

    // Validate that new mint is different from old mint
    require!(
        old_mint != new_mint,
        ProgramErrorCode::SamePaymentMint
    );

    // Update payment mint
    ctx.accounts.admin_state.payment_mint = new_mint;

    msg!("Payment mint updated:");
    msg!("  From: {}", old_mint);
    msg!("  To: {}", new_mint);
    msg!("  New vault: {}", ctx.accounts.new_vault.key());

    Ok(())
}
