use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface, transfer_checked, TransferChecked};

use crate::error::ProgramErrorCode;
use crate::state::*;

#[derive(Accounts)]
pub struct PurchaseDongle<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,

    #[account(
        seeds = [b"admin_state".as_ref()],
        bump,
    )]
    pub admin_state: Box<Account<'info, AdminState>>,

    /// User state to check if buyer has an NFT (created if not exists)
    #[account(
        init_if_needed,
        seeds = [b"user_state".as_ref(), buyer.key().as_ref()],
        bump,
        payer = buyer,
        space = UserState::space()
    )]
    pub user_state: Box<Account<'info, UserState>>,

    // === Payment token accounts ===
    /// The SPL token mint for payment (e.g., USDC) - must match admin_state.payment_mint
    #[account(
        constraint = payment_mint.key() == admin_state.payment_mint @ ProgramErrorCode::InvalidPaymentMint
    )]
    pub payment_mint: InterfaceAccount<'info, Mint>,

    /// Buyer's token account for payment
    #[account(
        mut,
        constraint = buyer_token_account.mint == payment_mint.key() @ ProgramErrorCode::InvalidPaymentTokenAccount,
        constraint = buyer_token_account.owner == buyer.key() @ ProgramErrorCode::InvalidPaymentTokenAccount
    )]
    pub buyer_token_account: InterfaceAccount<'info, TokenAccount>,

    /// Vault token account (PDA-controlled) to receive payment
    #[account(
        mut,
        seeds = [b"vault", payment_mint.key().as_ref()],
        bump,
        token::mint = payment_mint,
        token::authority = admin_state,
        token::token_program = payment_token_program,
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,

    /// Token program for payment (can be Token or Token2022)
    pub payment_token_program: Interface<'info, TokenInterface>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<PurchaseDongle>) -> Result<()> {
    msg!("Processing dongle purchase");

    // Check if purchase is enabled
    require!(
        ctx.accounts.admin_state.purchase_started,
        ProgramErrorCode::PurchaseNotStarted
    );

    // Determine price based on whether user has a soulbound NFT
    let is_nft_holder = ctx.accounts.user_state.nft_address != Pubkey::default();
    
    let price = if is_nft_holder {
        msg!("User is NFT holder - applying discounted price");
        ctx.accounts.admin_state.dongle_price_nft_holder
    } else {
        msg!("User is not NFT holder - applying normal price");
        ctx.accounts.admin_state.dongle_price_normal
    };

    msg!("Dongle price: {} (smallest units)", price);

    // Transfer payment tokens from buyer to vault
    transfer_checked(
        CpiContext::new(
            ctx.accounts.payment_token_program.to_account_info(),
            TransferChecked {
                from: ctx.accounts.buyer_token_account.to_account_info(),
                mint: ctx.accounts.payment_mint.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
                authority: ctx.accounts.buyer.to_account_info(),
            },
        ),
        price,
        ctx.accounts.payment_mint.decimals,
    )?;

    msg!("Dongle purchase completed - {} tokens transferred to vault", price);

    Ok(())
}
