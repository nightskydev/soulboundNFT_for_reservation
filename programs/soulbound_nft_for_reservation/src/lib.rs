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

    /// Initialize admin state with super_admin (signer) and vice_admins
    pub fn init_admin(
        ctx: Context<InitAdmin>, 
        mint_fee: u64, 
        max_supply: u64, 
        withdraw_wallet: Pubkey, 
        mint_start_date: i64,
        dongle_price_nft_holder: u64,
        dongle_price_normal: u64,
        vice_admins: [Pubkey; 4],
    ) -> Result<()> {
        instructions::init_admin::handler(ctx, mint_fee, max_supply, withdraw_wallet, mint_start_date, dongle_price_nft_holder, dongle_price_normal, vice_admins)
    }

    /// Propose or approve admin wallet update (3 of 5 multisig required)
    /// admin_wallets: [Pubkey; 5] where [0]=new_super_admin, [1-4]=new_vice_admins
    pub fn set_admin_wallet(ctx: Context<SetAdminWallet>, admin_wallets: [Pubkey; 5]) -> Result<()> {
        instructions::set_admin_wallet::handler(ctx, admin_wallets)
    }

    /// Cancel a pending admin wallet proposal (any multisig member)
    pub fn cancel_admin_wallet_proposal(ctx: Context<CancelAdminWalletProposal>) -> Result<()> {
        instructions::set_admin_wallet::cancel_handler(ctx)
    }

    /// Update mint fee (super_admin only)
    pub fn update_mint_fee(ctx: Context<UpdateAdminInfo>, mint_fee: u64) -> Result<()> {
        instructions::update_admin::update_mint_fee_handler(ctx, mint_fee)
    }

    /// Update max supply (super_admin only)
    pub fn update_max_supply(ctx: Context<UpdateAdminInfo>, max_supply: u64) -> Result<()> {
        instructions::update_admin::update_max_supply_handler(ctx, max_supply)
    }

    /// Update mint start date (super_admin only)
    pub fn update_mint_start_date(ctx: Context<UpdateAdminInfo>, mint_start_date: i64) -> Result<()> {
        instructions::update_admin::update_mint_start_date_handler(ctx, mint_start_date)
    }

    /// Update dongle price for NFT holders (super_admin only)
    pub fn update_dongle_price_nft_holder(ctx: Context<UpdateAdminInfo>, dongle_price_nft_holder: u64) -> Result<()> {
        instructions::update_admin::update_dongle_price_nft_holder_handler(ctx, dongle_price_nft_holder)
    }

    /// Update dongle price for normal users (super_admin only)
    pub fn update_dongle_price_normal(ctx: Context<UpdateAdminInfo>, dongle_price_normal: u64) -> Result<()> {
        instructions::update_admin::update_dongle_price_normal_handler(ctx, dongle_price_normal)
    }

    /// Update purchase started flag (super_admin only)
    pub fn update_purchase_started(ctx: Context<UpdateAdminInfo>, purchase_started: bool) -> Result<()> {
        instructions::update_admin::update_purchase_started_handler(ctx, purchase_started)
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

    /// Purchase a dongle - NFT holders pay discounted price, normal users pay full price
    pub fn purchase_dongle(ctx: Context<PurchaseDongle>) -> Result<()> {
        instructions::purchase_dongle::handler(ctx)
    }
}
