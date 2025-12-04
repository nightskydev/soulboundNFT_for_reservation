use anchor_lang::prelude::*;

use crate::state::*;
use crate::error::ProgramErrorCode;

/// Propose or approve admin wallet update (3 of 5 multisig required)
/// admin_wallets: [Pubkey; 5] where [0]=new_super_admin, [1-4]=new_vice_admins
#[derive(Accounts)]
pub struct SetAdminWallet<'info> {
    /// Signer must be super_admin or one of the vice_admins
    #[account(mut)]
    pub signer: Signer<'info>,

    #[account(
        mut,
        seeds = [b"admin_state".as_ref()],
        bump,
    )]
    pub admin_state: Box<Account<'info, AdminState>>,
}

pub fn handler(ctx: Context<SetAdminWallet>, admin_wallets: [Pubkey; 5]) -> Result<()> {
    let admin_state = &mut ctx.accounts.admin_state;
    let signer = ctx.accounts.signer.key();

    // Verify signer is part of the multisig (super_admin or vice_admin)
    let signer_index = admin_state.get_signer_index(&signer)
        .ok_or(ProgramErrorCode::NotMultisigMember)?;

    // Validate the proposed admin wallets
    let new_super_admin = admin_wallets[0];
    let new_vice_admins = [admin_wallets[1], admin_wallets[2], admin_wallets[3], admin_wallets[4]];

    // Super admin cannot be empty
    require!(
        new_super_admin != Pubkey::default(),
        ProgramErrorCode::InvalidSuperAdmin
    );

    // Vice admins cannot be the same as super admin
    for vice_admin in new_vice_admins.iter() {
        if *vice_admin != Pubkey::default() {
            require!(
                *vice_admin != new_super_admin,
                ProgramErrorCode::InvalidViceAdmin
            );
        }
    }

    // No duplicate vice admins (except for default/empty pubkeys)
    for i in 0..4 {
        if new_vice_admins[i] != Pubkey::default() {
            for j in (i + 1)..4 {
                require!(
                    new_vice_admins[i] != new_vice_admins[j],
                    ProgramErrorCode::DuplicateViceAdmin
                );
            }
        }
    }

    // Check if this is a new proposal or approval of existing
    if !admin_state.has_pending_admin_proposal() {
        // New proposal
        msg!("New admin wallet proposal created by signer index {}", signer_index);
        admin_state.pending_admin_wallets = admin_wallets;
        admin_state.admin_approval_bitmap = 0; // Reset approvals
        admin_state.add_admin_approval(signer_index);
        msg!("Proposed super admin: {}", new_super_admin);
        for (i, va) in new_vice_admins.iter().enumerate() {
            if *va != Pubkey::default() {
                msg!("Proposed vice admin {}: {}", i + 1, va);
            }
        }
        msg!("Approvals: 1/{}", AdminState::REQUIRED_APPROVALS);
    } else if admin_state.pending_admin_wallets == admin_wallets {
        // Approving existing proposal
        require!(
            !admin_state.has_admin_approved(signer_index),
            ProgramErrorCode::AlreadyApproved
        );

        admin_state.add_admin_approval(signer_index);
        let approval_count = admin_state.admin_approval_count();
        msg!("Approval added by signer index {}", signer_index);
        msg!("Approvals: {}/{}", approval_count, AdminState::REQUIRED_APPROVALS);

        // Check if threshold reached
        if approval_count >= AdminState::REQUIRED_APPROVALS {
            let old_super_admin = admin_state.super_admin;
            let old_vice_admins = admin_state.vice_admins;
            
            admin_state.apply_admin_wallets();
            
            msg!("✓ Threshold reached! Admin wallets updated:");
            msg!("  Super admin: {} -> {}", old_super_admin, admin_state.super_admin);
            for i in 0..4 {
                if old_vice_admins[i] != Pubkey::default() || admin_state.vice_admins[i] != Pubkey::default() {
                    msg!("  Vice admin {}: {} -> {}", i + 1, old_vice_admins[i], admin_state.vice_admins[i]);
                }
            }
        }
    } else {
        // Different proposal exists - reject or allow override?
        // For security, require explicit cancellation first
        return err!(ProgramErrorCode::DifferentProposalPending);
    }

    Ok(())
}

/// Cancel a pending admin wallet proposal (any multisig member can cancel)
#[derive(Accounts)]
pub struct CancelAdminWalletProposal<'info> {
    /// Signer must be super_admin or one of the vice_admins
    #[account(mut)]
    pub signer: Signer<'info>,

    #[account(
        mut,
        seeds = [b"admin_state".as_ref()],
        bump,
    )]
    pub admin_state: Box<Account<'info, AdminState>>,
}

pub fn cancel_handler(ctx: Context<CancelAdminWalletProposal>) -> Result<()> {
    let admin_state = &mut ctx.accounts.admin_state;
    let signer = ctx.accounts.signer.key();

    // Verify signer is part of the multisig
    let _ = admin_state.get_signer_index(&signer)
        .ok_or(ProgramErrorCode::NotMultisigMember)?;

    require!(
        admin_state.has_pending_admin_proposal(),
        ProgramErrorCode::NoProposalPending
    );

    let cancelled_super_admin = admin_state.pending_admin_wallets[0];
    admin_state.reset_admin_proposal();

    msg!("Admin wallet proposal cancelled. Proposed super admin was: {}", cancelled_super_admin);

    Ok(())
}

