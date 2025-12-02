use anchor_lang::prelude::*;

use crate::state::*;
use crate::error::ProgramErrorCode;

#[derive(Accounts)]
pub struct UpdateAdminInfo<'info> {
    /// Only super_admin can update admin settings
    #[account(mut)]
    pub super_admin: Signer<'info>,

    /// CHECK: Validated in handler that this is not a system program
    #[account(mut)]
    pub new_super_admin: AccountInfo<'info>,

    #[account(
        mut,
        seeds = [b"admin_state".as_ref()],
        bump,
        constraint = admin_state.super_admin == super_admin.key() @ ProgramErrorCode::Unauthorized
     )]
    pub admin_state: Box<Account<'info, AdminState>>,
}

pub fn handler(ctx: Context<UpdateAdminInfo>, mint_fee: u64, max_supply: u64) -> Result<()> {
    // Validate that new_super_admin is not a system program
    require!(
        ctx.accounts.new_super_admin.key() != anchor_lang::solana_program::system_program::id(),
        ProgramErrorCode::InvalidAdminAccount
    );

    ctx.accounts.admin_state.super_admin = *ctx.accounts.new_super_admin.key;
    ctx.accounts.admin_state.mint_fee = mint_fee;
    ctx.accounts.admin_state.max_supply = max_supply;
    
    // NOTE: payment_mint cannot be changed because the vault PDA is derived from it.
    // NOTE: withdraw_wallet requires 3/5 multisig approval via update_withdraw_wallet.
    // NOTE: vice_admins are set separately via set_vice_admins.
    
    msg!("Admin settings updated. Super admin: {}", ctx.accounts.new_super_admin.key());
    
    Ok(())
}
