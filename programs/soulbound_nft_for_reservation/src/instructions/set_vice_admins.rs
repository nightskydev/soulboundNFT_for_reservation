use anchor_lang::prelude::*;

use crate::state::*;
use crate::error::ProgramErrorCode;

#[derive(Accounts)]
pub struct SetViceAdmins<'info> {
    /// Only super_admin can set vice admins
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

pub fn handler(ctx: Context<SetViceAdmins>, vice_admins: [Pubkey; 4]) -> Result<()> {
    // Validate that vice_admins don't include super_admin
    for vice_admin in vice_admins.iter() {
        require!(
            *vice_admin != ctx.accounts.super_admin.key(),
            ProgramErrorCode::InvalidViceAdmin
        );
    }

    // Validate no duplicates (except for default/empty pubkeys)
    for i in 0..4 {
        if vice_admins[i] != Pubkey::default() {
            for j in (i + 1)..4 {
                require!(
                    vice_admins[i] != vice_admins[j],
                    ProgramErrorCode::DuplicateViceAdmin
                );
            }
        }
    }

    ctx.accounts.admin_state.vice_admins = vice_admins;
    
    // Reset any pending proposal when vice admins change
    ctx.accounts.admin_state.reset_proposal();

    msg!("Vice admins updated:");
    for (i, va) in vice_admins.iter().enumerate() {
        if *va != Pubkey::default() {
            msg!("  Vice admin {}: {}", i + 1, va);
        }
    }

    Ok(())
}

