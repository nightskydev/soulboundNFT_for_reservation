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
    // OG Collection parameters
    og_collection_mint: Pubkey,
    og_mint_fee: u64,
    og_max_supply: u64,
    og_admin_mint_limit: u64,
    // Regular Collection parameters
    regular_collection_mint: Pubkey,
    regular_mint_fee: u64,
    regular_max_supply: u64,
    regular_admin_mint_limit: u64,
    // Basic Collection parameters
    basic_collection_mint: Pubkey,
    basic_mint_fee: u64,
    basic_max_supply: u64,
    basic_admin_mint_limit: u64,
    // Shared parameters
    withdraw_wallet: Pubkey,
    mint_start_date: i64,
) -> Result<()> {
    let super_admin_key = *ctx.accounts.super_admin.key;

    // Validate that withdraw_wallet is not empty
    require!(
        withdraw_wallet != Pubkey::default(),
        ProgramErrorCode::InvalidWithdrawWallet
    );

    // Validate that all mint fees are greater than 0
    require!(og_mint_fee > 0, ProgramErrorCode::InvalidMintFee);
    require!(regular_mint_fee > 0, ProgramErrorCode::InvalidMintFee);
    require!(basic_mint_fee > 0, ProgramErrorCode::InvalidMintFee);

    // Validate collection mints are not default
    require!(og_collection_mint != Pubkey::default(), ProgramErrorCode::InvalidCollectionMint);
    require!(regular_collection_mint != Pubkey::default(), ProgramErrorCode::InvalidCollectionMint);
    require!(basic_collection_mint != Pubkey::default(), ProgramErrorCode::InvalidCollectionMint);

    ctx.accounts.admin_state.bump = ctx.bumps.admin_state;
    ctx.accounts.admin_state.super_admin = super_admin_key;
    ctx.accounts.admin_state.withdraw_wallet = withdraw_wallet;
    ctx.accounts.admin_state.payment_mint = ctx.accounts.payment_mint.key();
    ctx.accounts.admin_state.mint_start_date = mint_start_date;

    // Initialize OG Collection
    ctx.accounts.admin_state.og_collection = crate::state::CollectionConfig::new(
        og_collection_mint,
        og_mint_fee,
        og_max_supply,
        og_admin_mint_limit
    );

    // Initialize Regular Collection
    ctx.accounts.admin_state.regular_collection = crate::state::CollectionConfig::new(
        regular_collection_mint,
        regular_mint_fee,
        regular_max_supply,
        regular_admin_mint_limit
    );

    // Initialize Basic Collection
    ctx.accounts.admin_state.basic_collection = crate::state::CollectionConfig::new(
        basic_collection_mint,
        basic_mint_fee,
        basic_max_supply,
        basic_admin_mint_limit
    );

    msg!("Admin initialized with vault at: {}", ctx.accounts.vault.key());
    msg!("Super admin: {}", super_admin_key);
    msg!("Withdraw wallet: {}, mint_start_date: {}", withdraw_wallet, mint_start_date);
    msg!("OG Collection: {}, fee: {}, max_supply: {}, admin_limit: {}", og_collection_mint, og_mint_fee, og_max_supply, og_admin_mint_limit);
    msg!("Regular Collection: {}, fee: {}, max_supply: {}, admin_limit: {}", regular_collection_mint, regular_mint_fee, regular_max_supply, regular_admin_mint_limit);
    msg!("Basic Collection: {}, fee: {}, max_supply: {}, admin_limit: {}", basic_collection_mint, basic_mint_fee, basic_max_supply, basic_admin_mint_limit);

    Ok(())
}
