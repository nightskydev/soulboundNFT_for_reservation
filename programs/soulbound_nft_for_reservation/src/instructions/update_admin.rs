use anchor_lang::prelude::*;

use crate::state::*;

#[derive(Accounts)]
pub struct UpdateAdminInfo<'info> {
    /// CHECK: This is not dangerous because we don't read or write from this account
    #[account(mut)]
    pub admin: Signer<'info>,

    /// CHECK: This is not dangerous because we don't read or write from this account
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
    ctx.accounts.admin_state.admin = *ctx.accounts.new_admin.key;
    ctx.accounts.admin_state.mint_fee = mint_fee;
    Ok(())
}
