use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken, token_2022, token_2022::Burn, token_interface::Token2022
};
use solana_program::program::{invoke, invoke_signed};
use anchor_spl::token_2022::spl_token_2022;

use crate::state::*;

#[derive(Accounts)]
pub struct BurnNft<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token2022>,
    /// CHECK: We will create this one for the user
    #[account(mut)]
    pub old_token_account: AccountInfo<'info>,
    /// CHECK: We will create this one for the user
    #[account(mut)]
    pub old_mint: AccountInfo<'info>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    #[account( 
        mut, 
        seeds = [b"admin_state".as_ref()],
        bump,
    )]
    pub admin_state: Account<'info, AdminState >,
    #[account(
        init_if_needed,
        seeds = [b"user_state".as_ref(), signer.key().as_ref()],
        bump,
        payer = signer,
        space = UserState::space()
    )]
    pub user_state: Box<Account<'info, UserState>>,
}

pub fn handler(
    ctx: Context<BurnNft>,
) -> Result<()> {
    msg!("Burn NFT process started");

    let seeds = b"admin_state";
    let bump = ctx.bumps.admin_state;
    let signer: &[&[&[u8]]] = &[&[seeds, &[bump]]];

    // burn old token
    token_2022::burn(
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

    // Close user account
    invoke(
        &spl_token_2022::instruction::close_account(
            ctx.accounts.token_program.key,
            ctx.accounts.old_token_account.to_account_info().key,
            ctx.accounts.signer.key,
            ctx.accounts.signer.key,
            &[],
        )?,
        &[
            ctx.accounts.token_program.to_account_info(),
            ctx.accounts.old_token_account.to_account_info(),
            ctx.accounts.signer.to_account_info(),
            ctx.accounts.signer.to_account_info(),
        ],
    )?;

    // Close mint
    invoke_signed(
        &spl_token_2022::instruction::close_account(
            ctx.accounts.token_program.key,
            ctx.accounts.old_mint.to_account_info().key,
            ctx.accounts.signer.key,
            &ctx.accounts.admin_state.key(),
            &[],
        )?,
        &[
            ctx.accounts.token_program.to_account_info(),
            ctx.accounts.old_mint.to_account_info(),
            ctx.accounts.signer.to_account_info(),
            ctx.accounts.admin_state.to_account_info(),
        ],
        signer,
    )?;

    // store user's info - nft address
    ctx.accounts.user_state.nft_address = Pubkey::default();
    ctx.accounts.admin_state.current_reserved_count -= 1; // decrement reserved count

    Ok(())
}
