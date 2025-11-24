use anchor_lang::prelude::*;

use crate::state::*;
use crate::error::ProgramErrorCode;

#[derive(Accounts)]
pub struct UpdateAdminInfo<'info> {
    /// CHECK: This is not dangerous because we don't read or write from this account
    #[account(mut)]
    pub admin: Signer<'info>,

    /// CHECK: Validated in handler that this is not a system program
    #[account(mut)]
    pub new_admin: AccountInfo<'info>,

    #[account(
        mut,
        seeds = [b"admin_state".as_ref()],
        bump,
        constraint = admin_state.admin == admin.key()
     )]
    pub admin_state: Box<Account<'info, AdminState>>,
}

pub fn handler(ctx: Context<UpdateAdminInfo>, mint_fee: u64) -> Result<()> {
    // Validate that new_admin is not a system program
    require!(
        ctx.accounts.new_admin.key() != anchor_lang::solana_program::system_program::id(),
        ProgramErrorCode::InvalidAdminAccount
    );

    // Validate that new_admin is not the same as current admin (optional, but prevents unnecessary updates)
    // This is commented out to allow setting the same admin if needed (e.g., to just update fee)
    // require!(
    //     ctx.accounts.new_admin.key() != ctx.accounts.admin.key(),
    //     ProgramErrorCode::InvalidAdminAccount
    // );

    ctx.accounts.admin_state.admin = *ctx.accounts.new_admin.key; // update new admin
    ctx.accounts.admin_state.mint_fee = mint_fee; // update mint fee in lamports
    Ok(())
}
