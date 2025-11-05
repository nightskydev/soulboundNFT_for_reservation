use anchor_lang::prelude::*;
use crate::state::*;
use anchor_spl::token::{
    self, spl_token::instruction::AuthorityType, CloseAccount, Mint, SetAuthority, Token,
    TokenAccount, Transfer,
};

#[derive(Accounts)]
pub struct InitializeAdmin<'info> {
    #[account(mut)]
    pub mint: Account<'info, Mint>,
    #[account(
        init,
        seeds = [b"vault".as_ref()],
        bump,
        payer = initializer,
        token::mint = mint,
        token::authority = admin_state,
    )]
    pub vault: Account<'info, TokenAccount>,

    #[account(
        init,
        seeds = [b"state".as_ref(), b"admin".as_ref()],
        bump,
        payer = initializer,
        space = AdminState::space(),
    )]
    pub admin_state: Box<Account<'info, AdminState>>,

    /// CHECK: This is the treasury wallet that will receive rewards
    pub treasury: UncheckedAccount<'info>,

    #[account(mut)]
    pub initializer: Signer<'info>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
}

#[derive(AnchorDeserialize, AnchorSerialize)]
pub struct InitializeAdminArgs {
    pub risk_based_apy: [u8; 3],
    pub staking_period_range: [u64; 2], // in seconds
    pub withdraw_available_after: u64, // in seconds
}

impl<'info> InitializeAdmin<'info> {
    pub fn handler(ctx: Context<InitializeAdmin>, args: InitializeAdminArgs) -> Result<()> {
        let admin_state = &mut ctx.accounts.admin_state;
        admin_state.risk_based_apy = args.risk_based_apy; // Set default APY values as needed
        admin_state.staking_period_range = args.staking_period_range; // Set default staking period range
        admin_state.withdraw_available_after = args.withdraw_available_after; // Set default withdraw available after time
        // Set the token mint, admin, and treasury addresses
        admin_state.token_mint = ctx.accounts.mint.key();
        admin_state.admin = ctx.accounts.initializer.key();
        admin_state.treasury = ctx.accounts.treasury.key();
        Ok(())
    }
}
