use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{self, Token, Burn, CloseAccount},
};
use spl_associated_token_account::get_associated_token_address_with_program_id;
use spl_token::id as token_program_id;

use crate::state::*;
use crate::error::ProgramErrorCode;

// Event definition
#[event]
pub struct BurnNftEvent {
    pub user: Pubkey,
    pub mint_address: Pubkey,
    pub collection_type: CollectionType,
    pub timestamp: i64,
}

#[derive(Accounts)]
pub struct BurnNft<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    /// CHECK: Validated in handler that this is the correct ATA
    #[account(mut)]
    pub old_token_account: UncheckedAccount<'info>,
    /// CHECK: Validated in handler that this matches user_state.mint_address
    #[account(mut)]
    pub old_mint: UncheckedAccount<'info>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    #[account( 
        mut, 
        seeds = [b"admin_state".as_ref()],
        bump,
    )]
    pub admin_state: Box<Account<'info, AdminState>>,

    /// User state account to reset after burning
    #[account(
        mut,
        seeds = [b"user_state", signer.key().as_ref()],
        bump,
        constraint = user_state.user == signer.key() @ ProgramErrorCode::InvalidUserState,
        constraint = user_state.has_minted @ ProgramErrorCode::UserHasNotMinted,
    )]
    pub user_state: Account<'info, UserState>,
}

pub fn handler(ctx: Context<BurnNft>) -> Result<()> {
    // Get collection type from user state (single source of truth)
    let collection_type = ctx.accounts.user_state.collection_type;
    
    msg!("Burn NFT process started for collection type: {:?}", collection_type);

    // Validate that the mint being burned matches the user's recorded mint
    require!(
        ctx.accounts.old_mint.key() == ctx.accounts.user_state.mint_address,
        ProgramErrorCode::InvalidMint
    );
    msg!("Validated mint matches user state");

    // Validate that old_token_account is the correct associated token account for the signer
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

    // **UNFREEZE THE TOKEN ACCOUNT FIRST** (Required for soulbound NFTs)
    // The account was frozen to make it non-transferable, but we need to unfreeze it to burn it
    let bump = ctx.bumps.admin_state;
    let signer_seeds: &[&[&[u8]]] = &[&[b"admin_state", &[bump]]];
    
    token::thaw_account(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            token::ThawAccount {
                account: ctx.accounts.old_token_account.to_account_info(),
                mint: ctx.accounts.old_mint.to_account_info(),
                authority: ctx.accounts.admin_state.to_account_info(),
            },
            signer_seeds,
        ),
    )?;
    msg!("Token account unfrozen for burning");

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
    
    // Decrement reserved count for the specific collection with underflow protection
    let collection_config = ctx.accounts.admin_state.get_collection_config_mut(collection_type);
    collection_config.current_reserved_count = collection_config
        .current_reserved_count
        .checked_sub(1)
        .ok_or(ProgramErrorCode::ReservedCountUnderflow)?;
    
    msg!(
        "Collection {:?} reserved count decremented to: {}",
        collection_type,
        collection_config.current_reserved_count
    );

    // Reset user state to allow minting again
    ctx.accounts.user_state.has_minted = false;
    ctx.accounts.user_state.mint_address = Pubkey::default();
    ctx.accounts.user_state.minted_at = 0;
    // Keep user, collection_type, and bump unchanged for reference
    
    msg!(
        "User state reset - user {} can now mint again",
        ctx.accounts.signer.key()
    );

    // Emit burn event
    let clock = Clock::get()?;
    emit!(BurnNftEvent {
        user: ctx.accounts.signer.key(),
        mint_address: ctx.accounts.old_mint.key(),
        collection_type,
        timestamp: clock.unix_timestamp,
    });

    msg!("NFT burn complete for collection {:?}", collection_type);

    Ok(())
}
