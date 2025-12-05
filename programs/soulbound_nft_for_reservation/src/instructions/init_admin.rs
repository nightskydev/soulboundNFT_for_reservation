use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

use crate::state::*;
use crate::error::ProgramErrorCode;

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

pub fn handler(
    ctx: Context<InitAdmin>, 
    mint_fee: u64, 
    max_supply: u64, 
    withdraw_wallet: Pubkey, 
    mint_start_date: i64,
    dongle_price_nft_holder: u64,
    dongle_price_normal: u64,
) -> Result<()> {
    let super_admin_key = *ctx.accounts.super_admin.key;

    // Validate that withdraw_wallet is not empty
    require!(
        withdraw_wallet != Pubkey::default(),
        ProgramErrorCode::InvalidWithdrawWallet
    );

    ctx.accounts.admin_state.bump = ctx.bumps.admin_state;
    ctx.accounts.admin_state.super_admin = super_admin_key;
    ctx.accounts.admin_state.withdraw_wallet = withdraw_wallet;
    ctx.accounts.admin_state.mint_fee = mint_fee;
    ctx.accounts.admin_state.current_reserved_count = 0;
    ctx.accounts.admin_state.payment_mint = ctx.accounts.payment_mint.key();
    ctx.accounts.admin_state.max_supply = max_supply;
    ctx.accounts.admin_state.mint_start_date = mint_start_date;
    ctx.accounts.admin_state.dongle_price_nft_holder = dongle_price_nft_holder;
    ctx.accounts.admin_state.dongle_price_normal = dongle_price_normal;
    ctx.accounts.admin_state.purchase_started = false; // Disabled by default

    msg!("Admin initialized with vault at: {}, max_supply: {}, withdraw_wallet: {}, mint_start_date: {}", 
        ctx.accounts.vault.key(), max_supply, withdraw_wallet, mint_start_date);
    msg!("Dongle prices - NFT holder: {}, Normal: {}", dongle_price_nft_holder, dongle_price_normal);
    msg!("Super admin: {}", super_admin_key);

    Ok(())
}
