use anchor_lang::prelude::*;

use crate::state::*;

#[derive(Accounts)]
pub struct InitAdmin<'info> {
    /// CHECK: This is not dangerous because we don't read or write from this account
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
         init,
         seeds = [b"admin_state".as_ref()],
         bump,
         payer = admin,
         space = AdminState::space()
     )]
    pub admin_state: Box<Account<'info, AdminState>>,

    /// CHECK: This is not dangerous because we don't read or write from this account
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handler(ctx: Context<InitAdmin>, mint_fee: u64) -> Result<()> {
    ctx.accounts.admin_state.admin = *ctx.accounts.admin.key; // admin wallet address
    ctx.accounts.admin_state.mint_fee = mint_fee; //
    ctx.accounts.admin_state.bump = ctx.bumps.admin_state; // need to store bump for generate seeds

    Ok(())
}
