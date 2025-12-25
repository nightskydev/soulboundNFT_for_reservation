use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::{self, AssociatedToken},
    token::{self, Token, Mint, TokenAccount, transfer_checked, TransferChecked},
    token_interface::{TokenInterface},
};
use mpl_token_metadata::{
    instructions::{CreateMetadataAccountV3, CreateMetadataAccountV3InstructionArgs},
    types::{DataV2, Creator},
};
use solana_program::program::{invoke, invoke_signed};

use crate::error::ProgramErrorCode;
use crate::state::*;
use crate::utils::safe_create_account;

// Event definition
#[event]
pub struct BatchMintDongleNftEvent {
    pub user: Pubkey,
    pub dongle_ids: Vec<String>,
    pub mint_addresses: Vec<Pubkey>,
    pub timestamp: i64,
}

#[derive(Accounts)]
pub struct BatchMintDongleNft<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    /// CHECK: Metaplex Token Metadata program
    pub token_metadata_program: AccountInfo<'info>,

    #[account(
        mut,
        seeds = [b"admin_state".as_ref()],
        bump,
    )]
    pub admin_state: Box<Account<'info, AdminState>>,

    #[account(
        init_if_needed,
        seeds = [b"user_state".as_ref(), signer.key().as_ref()],
        bump,
        payer = signer,
        space = UserState::space()
    )]
    pub user_state: Box<Account<'info, UserState>>,

    // === Payment token accounts ===
    /// The SPL token mint for payment (e.g., USDC) - must match admin_state.payment_mint
    #[account(
        constraint = payment_mint.key() == admin_state.payment_mint @ ProgramErrorCode::InvalidPaymentMint
    )]
    pub payment_mint: InterfaceAccount<'info, Mint>,

    /// Payer's token account for payment
    #[account(
        mut,
        constraint = payer_token_account.mint == payment_mint.key() @ ProgramErrorCode::InvalidPaymentTokenAccount,
        constraint = payer_token_account.owner == signer.key() @ ProgramErrorCode::InvalidPaymentTokenAccount
    )]
    pub payer_token_account: InterfaceAccount<'info, TokenAccount>,

    /// Vault token account (PDA-controlled) to receive payment - created in init_admin
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
}

pub fn handler(
    ctx: Context<BatchMintDongleNft>,
    dongle_ids: Vec<String>,
    names: Vec<String>,
    symbols: Vec<String>,
    uris: Vec<String>,
) -> Result<()> {
    msg!("Batch mint dongle proof NFTs - payment processing only");

    // Validate input arrays have the same length
    let count = dongle_ids.len();
    require!(count > 0, ProgramErrorCode::InvalidDonglePrice); // Using this as a generic error
    require!(names.len() == count, ProgramErrorCode::InvalidDonglePrice);
    require!(symbols.len() == count, ProgramErrorCode::InvalidDonglePrice);
    require!(uris.len() == count, ProgramErrorCode::InvalidDonglePrice);

    // Check max supply (0 = unlimited)
    let max_supply = ctx.accounts.admin_state.max_supply;
    if max_supply > 0 {
        require!(
            ctx.accounts.admin_state.current_reserved_count + count as u64 <= max_supply,
            ProgramErrorCode::MaxSupplyReached
        );
    }

    // Calculate total fee for batch minting
    let total_fee = ctx.accounts.admin_state.mint_fee * count as u64;

    // Transfer total payment
    transfer_checked(
        CpiContext::new(
            ctx.accounts.payment_token_program.to_account_info(),
            TransferChecked {
                from: ctx.accounts.payer_token_account.to_account_info(),
                mint: ctx.accounts.payment_mint.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
                authority: ctx.accounts.signer.to_account_info(),
            },
        ),
        total_fee,
        ctx.accounts.payment_mint.decimals,
    )?;

    // Update reserved count
    ctx.accounts.admin_state.current_reserved_count += count as u64;

    // Emit event (with empty mint addresses since actual minting happens separately)
    emit!(BatchMintDongleNftEvent {
        user: ctx.accounts.signer.key(),
        dongle_ids,
        mint_addresses: vec![], // Actual mint addresses will be created via separate mint_nft calls
        timestamp: Clock::get()?.unix_timestamp,
    });

    msg!("Processed payment for batch minting {} dongle proof NFTs", count);
    Ok(())
}
