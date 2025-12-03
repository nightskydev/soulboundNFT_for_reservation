#![allow(unexpected_cfgs)]

use anchor_lang::prelude::*;

pub mod error;
pub mod state;
pub mod utils;
pub mod instructions;

pub use utils::*;
pub use instructions::*;

pub use crate::error::ProgramErrorCode;

declare_id!("H1frppnuiTXeGNk34HmcRtuK3SDUokpGK3az76JjNzYe");

#[program]
pub mod soulbound_nft_for_reservation {
    use super::*;

    /// Initialize admin state (super_admin only, one-time setup)
    pub fn init_admin(ctx: Context<InitAdmin>, mint_fee: u64, max_supply: u64, withdraw_wallet: Pubkey, mint_start_date: i64) -> Result<()> {
        instructions::init_admin::handler(ctx, mint_fee, max_supply, withdraw_wallet, mint_start_date)
    }

    /// Set vice admin wallets (super_admin only)
    pub fn set_vice_admins(ctx: Context<SetViceAdmins>, vice_admins: [Pubkey; 4]) -> Result<()> {
        instructions::set_vice_admins::handler(ctx, vice_admins)
    }

    /// Update admin settings like mint_fee, max_supply, and mint_start_date (super_admin only)
    pub fn update_admin_info(ctx: Context<UpdateAdminInfo>, mint_fee: u64, max_supply: u64, mint_start_date: i64) -> Result<()> {
        instructions::update_admin::handler(ctx, mint_fee, max_supply, mint_start_date)
    }

    /// Propose or approve withdraw wallet update (3 of 5 multisig required)
    /// - If no pending proposal: creates new proposal with first approval
    /// - If same proposal pending: adds approval, updates if threshold reached
    pub fn update_withdraw_wallet(ctx: Context<UpdateWithdrawWallet>, new_withdraw_wallet: Pubkey) -> Result<()> {
        instructions::update_withdraw_wallet::handler(ctx, new_withdraw_wallet)
    }

    /// Cancel a pending withdraw wallet proposal (any multisig member)
    pub fn cancel_withdraw_wallet_proposal(ctx: Context<CancelWithdrawWalletProposal>) -> Result<()> {
        instructions::update_withdraw_wallet::cancel_handler(ctx)
    }

    pub fn mint_nft(ctx: Context<MintNft>, name: String, symbol: String, uri: String) -> Result<()> {
        instructions::mint_nft::handler(ctx, name, symbol, uri)
    }

    pub fn burn_nft(ctx: Context<BurnNft>) -> Result<()> {
        instructions::burn_nft::handler(ctx)
    }

    /// Withdraw payment tokens from the vault (super_admin only)
    pub fn withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
        instructions::withdraw::handler(ctx, amount)
    }
}
