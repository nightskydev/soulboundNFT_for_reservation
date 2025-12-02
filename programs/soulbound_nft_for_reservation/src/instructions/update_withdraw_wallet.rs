use anchor_lang::prelude::*;

use crate::state::*;
use crate::error::ProgramErrorCode;

/// Propose or approve a withdraw wallet update (3 of 5 multisig required)
#[derive(Accounts)]
pub struct UpdateWithdrawWallet<'info> {
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

pub fn handler(ctx: Context<UpdateWithdrawWallet>, new_withdraw_wallet: Pubkey) -> Result<()> {
    let admin_state = &mut ctx.accounts.admin_state;
    let signer = ctx.accounts.signer.key();

    // Verify signer is part of the multisig (super_admin or vice_admin)
    let signer_index = admin_state.get_signer_index(&signer)
        .ok_or(ProgramErrorCode::NotMultisigMember)?;

    // Check if this is a new proposal or approval of existing
    if admin_state.pending_withdraw_wallet == Pubkey::default() {
        // New proposal
        msg!("New withdraw wallet proposal created by signer index {}", signer_index);
        admin_state.pending_withdraw_wallet = new_withdraw_wallet;
        admin_state.approval_bitmap = 0; // Reset approvals
        admin_state.add_approval(signer_index);
        msg!("Proposed withdraw wallet: {}", new_withdraw_wallet);
        msg!("Approvals: 1/{}", AdminState::REQUIRED_APPROVALS);
    } else if admin_state.pending_withdraw_wallet == new_withdraw_wallet {
        // Approving existing proposal
        require!(
            !admin_state.has_approved(signer_index),
            ProgramErrorCode::AlreadyApproved
        );

        admin_state.add_approval(signer_index);
        let approval_count = admin_state.approval_count();
        msg!("Approval added by signer index {}", signer_index);
        msg!("Approvals: {}/{}", approval_count, AdminState::REQUIRED_APPROVALS);

        // Check if threshold reached
        if approval_count >= AdminState::REQUIRED_APPROVALS {
            let old_wallet = admin_state.withdraw_wallet;
            admin_state.withdraw_wallet = admin_state.pending_withdraw_wallet;
            admin_state.reset_proposal();
            
            msg!("✓ Threshold reached! Withdraw wallet updated:");
            msg!("  From: {}", old_wallet);
            msg!("  To: {}", admin_state.withdraw_wallet);
        }
    } else {
        // Different proposal exists - reject or allow override?
        // For security, require explicit cancellation first
        return err!(ProgramErrorCode::DifferentProposalPending);
    }

    Ok(())
}

/// Cancel a pending withdraw wallet proposal (any multisig member can cancel)
#[derive(Accounts)]
pub struct CancelWithdrawWalletProposal<'info> {
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

pub fn cancel_handler(ctx: Context<CancelWithdrawWalletProposal>) -> Result<()> {
    let admin_state = &mut ctx.accounts.admin_state;
    let signer = ctx.accounts.signer.key();

    // Verify signer is part of the multisig
    let _ = admin_state.get_signer_index(&signer)
        .ok_or(ProgramErrorCode::NotMultisigMember)?;

    require!(
        admin_state.pending_withdraw_wallet != Pubkey::default(),
        ProgramErrorCode::NoProposalPending
    );

    let cancelled_proposal = admin_state.pending_withdraw_wallet;
    admin_state.reset_proposal();

    msg!("Withdraw wallet proposal cancelled: {}", cancelled_proposal);

    Ok(())
}

