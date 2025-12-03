use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

use crate::state::*;

#[derive(Accounts)]
pub struct InitAdmin<'info> {
    /// Super admin who initializes the program
    #[account(mut)]
    pub super_admin: Signer<'info>,

    #[account(
         init,
         seeds = [b"admin_state".as_ref()],
         bump,
         payer = super_admin,
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
        payer = super_admin,
        seeds = [b"vault", payment_mint.key().as_ref()],
        bump,
        token::mint = payment_mint,
        token::authority = admin_state,
        token::token_program = payment_token_program,
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,

    /// Token program for payment mint (can be Token or Token2022)
    pub payment_token_program: Interface<'info, TokenInterface>,

    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handler(ctx: Context<InitAdmin>, mint_fee: u64, max_supply: u64, withdraw_wallet: Pubkey, mint_start_date: i64) -> Result<()> {
    ctx.accounts.admin_state.bump = ctx.bumps.admin_state;
    ctx.accounts.admin_state.super_admin = *ctx.accounts.super_admin.key;
    ctx.accounts.admin_state.vice_admins = [Pubkey::default(); 4]; // Initialize empty, set later
    ctx.accounts.admin_state.withdraw_wallet = withdraw_wallet;
    ctx.accounts.admin_state.mint_fee = mint_fee;
    ctx.accounts.admin_state.current_reserved_count = 0;
    ctx.accounts.admin_state.payment_mint = ctx.accounts.payment_mint.key();
    ctx.accounts.admin_state.max_supply = max_supply;
    ctx.accounts.admin_state.mint_start_date = mint_start_date;
    ctx.accounts.admin_state.pending_withdraw_wallet = Pubkey::default();
    ctx.accounts.admin_state.approval_bitmap = 0;

    msg!("Admin initialized with vault at: {}, max_supply: {}, withdraw_wallet: {}, mint_start_date: {}", 
        ctx.accounts.vault.key(), max_supply, withdraw_wallet, mint_start_date);
    msg!("Super admin: {}. Vice admins need to be set separately.", ctx.accounts.super_admin.key);

    Ok(())
}
