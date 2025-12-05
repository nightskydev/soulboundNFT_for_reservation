use anchor_lang::prelude::*;

use crate::state::*;
use crate::error::ProgramErrorCode;

/// Update withdraw wallet (super_admin only)
#[derive(Accounts)]
pub struct UpdateWithdrawWallet<'info> {
    /// Only super_admin can update withdraw wallet
    #[account(mut)]
    pub super_admin: Signer<'info>,

    #[account(
        mut,
        seeds = [b"admin_state".as_ref()],
        bump,
        constraint = admin_state.super_admin == super_admin.key() @ ProgramErrorCode::Unauthorized
    )]
    pub admin_state: Box<Account<'info, AdminState>>,
}

pub fn handler(ctx: Context<UpdateWithdrawWallet>, new_withdraw_wallet: Pubkey) -> Result<()> {
    // Validate that new_withdraw_wallet is not empty
    require!(
        new_withdraw_wallet != Pubkey::default(),
        ProgramErrorCode::InvalidWithdrawWallet
    );

    let old_wallet = ctx.accounts.admin_state.withdraw_wallet;
    ctx.accounts.admin_state.withdraw_wallet = new_withdraw_wallet;

    msg!("Withdraw wallet updated:");
    msg!("  From: {}", old_wallet);
    msg!("  To: {}", new_withdraw_wallet);

    Ok(())
}
