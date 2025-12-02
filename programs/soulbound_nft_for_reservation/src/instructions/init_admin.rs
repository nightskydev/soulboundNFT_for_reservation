use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

use crate::state::*;

#[derive(Accounts)]
pub struct InitAdmin<'info> {
    /// CHECK: This is not dangerous because we don't read or write from this account
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
         init,
         seeds = [b"admin_state".as_ref()],
         bump,
         payer = admin,
         space = AdminState::space()
     )]
    pub admin_state: Box<Account<'info, AdminState>>,

    /// The SPL token mint for payment (e.g., USDC)
    #[account(
        mint::token_program = payment_token_program
    )]
    pub payment_mint: InterfaceAccount<'info, Mint>,

    /// Vault token account (PDA-controlled) to hold payment tokens
    /// Created during init_admin, authority is admin_state PDA
    #[account(
        init,
        payer = admin,
        seeds = [b"vault", payment_mint.key().as_ref()],
        bump,
        token::mint = payment_mint,
        token::authority = admin_state,
        token::token_program = payment_token_program,
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,

    /// Token program for payment mint (can be Token or Token2022)
    pub payment_token_program: Interface<'info, TokenInterface>,

    /// CHECK: This is not dangerous because we don't read or write from this account
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handler(ctx: Context<InitAdmin>, mint_fee: u64, max_supply: u64) -> Result<()> {
    ctx.accounts.admin_state.admin = *ctx.accounts.admin.key; // admin wallet address
    ctx.accounts.admin_state.mint_fee = mint_fee; // mint fee in token smallest units
    ctx.accounts.admin_state.bump = ctx.bumps.admin_state; // need to store bump for generate seeds
    ctx.accounts.admin_state.current_reserved_count = 0; // initialize reserved count
    ctx.accounts.admin_state.payment_mint = ctx.accounts.payment_mint.key(); // payment token mint (e.g., USDC)
    ctx.accounts.admin_state.max_supply = max_supply; // max supply (0 = unlimited)

    msg!("Admin initialized with vault at: {}, max_supply: {}", ctx.accounts.vault.key(), max_supply);

    Ok(())
}
