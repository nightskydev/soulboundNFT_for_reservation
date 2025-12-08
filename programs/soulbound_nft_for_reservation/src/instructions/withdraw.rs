use anchor_lang::prelude::*;
use anchor_spl::token_interface::{
    transfer_checked, Mint, TokenAccount, TokenInterface, TransferChecked,
};

use crate::error::ProgramErrorCode;
use crate::state::*;

#[derive(Accounts)]
pub struct Withdraw<'info> {
    /// Super admin who can withdraw funds
    #[account(mut)]
    pub super_admin: Signer<'info>,

    #[account(
        mut,
        seeds = [b"admin_state".as_ref()],
        bump,
        constraint = admin_state.super_admin == super_admin.key() @ ProgramErrorCode::Unauthorized
    )]
    pub admin_state: Box<Account<'info, AdminState>>,

    /// The SPL token mint for payment (e.g., USDC) - must match admin_state.payment_mint
    #[account(
        constraint = payment_mint.key() == admin_state.payment_mint @ ProgramErrorCode::InvalidPaymentMint
    )]
    pub payment_mint: InterfaceAccount<'info, Mint>,

    /// Vault token account (PDA-controlled) holding the payment tokens
    #[account(
        mut,
        seeds = [b"vault", payment_mint.key().as_ref()],
        bump,
        token::mint = payment_mint,
        token::authority = admin_state,
        token::token_program = token_program,
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,

    /// Withdraw wallet's token account to receive withdrawn tokens
    /// Must be owned by admin_state.withdraw_wallet
    #[account(
        mut,
        constraint = withdraw_token_account.mint == payment_mint.key() @ ProgramErrorCode::InvalidPaymentTokenAccount,
        constraint = withdraw_token_account.owner == admin_state.withdraw_wallet @ ProgramErrorCode::InvalidWithdrawWallet
    )]
    pub withdraw_token_account: InterfaceAccount<'info, TokenAccount>,

    /// Token program for payment (can be Token or Token2022)
    pub token_program: Interface<'info, TokenInterface>,
}

pub fn handler(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
    msg!("Withdrawing {} tokens from vault to withdraw wallet: {}", 
        amount, ctx.accounts.admin_state.withdraw_wallet);

    // Validate amount
    require!(amount > 0, ProgramErrorCode::InvalidWithdrawAmount);
    require!(
        ctx.accounts.vault.amount >= amount,
        ProgramErrorCode::InsufficientVaultBalance
    );

    // Create signer seeds for admin_state PDA
    let seeds = b"admin_state";
    let bump = ctx.bumps.admin_state;
    let signer_seeds: &[&[&[u8]]] = &[&[seeds, &[bump]]];

    // Transfer tokens from vault to withdraw wallet's token account
    transfer_checked(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            TransferChecked {
                from: ctx.accounts.vault.to_account_info(),
                mint: ctx.accounts.payment_mint.to_account_info(),
                to: ctx.accounts.withdraw_token_account.to_account_info(),
                authority: ctx.accounts.admin_state.to_account_info(),
            },
            signer_seeds,
        ),
        amount,
        ctx.accounts.payment_mint.decimals,
    )?;

    msg!(
        "Successfully withdrew {} tokens to {}. Remaining vault balance: {}",
        amount,
        ctx.accounts.admin_state.withdraw_wallet,
        ctx.accounts.vault.amount - amount
    );

    Ok(())
}

pub fn withdraw_all_handler(ctx: Context<Withdraw>) -> Result<()> {
    let vault_balance = ctx.accounts.vault.amount;
    
    msg!("Withdrawing all {} tokens from vault to withdraw wallet: {}", 
        vault_balance, ctx.accounts.admin_state.withdraw_wallet);

    // Validate that vault has balance
    require!(
        vault_balance > 0,
        ProgramErrorCode::InsufficientVaultBalance
    );

    // Create signer seeds for admin_state PDA
    let seeds = b"admin_state";
    let bump = ctx.bumps.admin_state;
    let signer_seeds: &[&[&[u8]]] = &[&[seeds, &[bump]]];

    // Transfer all tokens from vault to withdraw wallet's token account
    transfer_checked(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            TransferChecked {
                from: ctx.accounts.vault.to_account_info(),
                mint: ctx.accounts.payment_mint.to_account_info(),
                to: ctx.accounts.withdraw_token_account.to_account_info(),
                authority: ctx.accounts.admin_state.to_account_info(),
            },
            signer_seeds,
        ),
        vault_balance,
        ctx.accounts.payment_mint.decimals,
    )?;

    msg!(
        "Successfully withdrew all {} tokens to {}. Vault balance is now 0.",
        vault_balance,
        ctx.accounts.admin_state.withdraw_wallet
    );

    Ok(())
}

