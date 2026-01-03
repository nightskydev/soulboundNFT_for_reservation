#![allow(unexpected_cfgs)]

use anchor_lang::prelude::*;

pub mod error;
pub mod state;
pub mod utils;
pub mod instructions;

pub use utils::*;
pub use instructions::*;

pub use crate::error::ProgramErrorCode;

declare_id!("7nwJWSLt65ZWBzBwSt9FTSF94phiafpj3NYzA7rm2Qb2");

#[program]
pub mod soulbound_nft_for_reservation {
    use super::*;

    /// Initialize admin state with super_admin (signer)
    pub fn init_admin(
        ctx: Context<InitAdmin>, 
        mint_fee: u64, 
        max_supply: u64, 
        withdraw_wallet: Pubkey, 
        mint_start_date: i64,
        dongle_price_nft_holder: u64,
        dongle_price_normal: u64,
    ) -> Result<()> {
        instructions::init_admin::handler(ctx, mint_fee, max_supply, withdraw_wallet, mint_start_date, dongle_price_nft_holder, dongle_price_normal)
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

    /// Update OG collection address (super_admin only)
    pub fn update_og_collection(ctx: Context<UpdateAdminInfo>, og_collection: Pubkey) -> Result<()> {
        instructions::update_admin::update_og_collection_handler(ctx, og_collection)
    }

    /// Update dongle proof collection address (super_admin only)
    pub fn update_dongle_proof_collection(ctx: Context<UpdateAdminInfo>, dongle_proof_collection: Pubkey) -> Result<()> {
        instructions::update_admin::update_dongle_proof_collection_handler(ctx, dongle_proof_collection)
    }

    /// Update withdraw wallet (super_admin only)
    pub fn update_withdraw_wallet(ctx: Context<UpdateWithdrawWallet>, new_withdraw_wallet: Pubkey) -> Result<()> {
        instructions::update_withdraw_wallet::handler(ctx, new_withdraw_wallet)
    }

    /// Update super admin - transfer admin control to a new address (super_admin only)
    pub fn update_super_admin(ctx: Context<UpdateAdminInfo>, new_super_admin: Pubkey) -> Result<()> {
        instructions::update_admin::update_super_admin_handler(ctx, new_super_admin)
    }

    /// Update payment mint - migrate to a new payment token (super_admin only)
    /// NOTE: Old vault must be empty (withdraw all funds first)
    pub fn update_payment_mint(ctx: Context<UpdatePaymentMint>) -> Result<()> {
        instructions::update_payment_mint::handler(ctx)
    }

    pub fn create_collection_nft(ctx: Context<CreateCollectionNft>, name: String, symbol: String, uri: String) -> Result<()> {
        instructions::create_collection_nft::handler(ctx, name, symbol, uri)
    }

    pub fn mint_nft(ctx: Context<MintNft>, name: String, symbol: String, uri: String) -> Result<()> {
        instructions::mint_nft::handler(ctx, name, symbol, uri)
    }

    pub fn update_nft_metadata(ctx: Context<UpdateNftMetadata>, name: Option<String>, symbol: Option<String>, uri: Option<String>) -> Result<()> {
        instructions::update_nft_metadata::handler(ctx, name, symbol, uri)
    }

    pub fn burn_nft(ctx: Context<BurnNft>) -> Result<()> {
        instructions::burn_nft::handler(ctx)
    }

    /// Withdraw payment tokens from the vault (super_admin only)
    pub fn withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
        instructions::withdraw::handler(ctx, amount)
    }

    /// Withdraw all payment tokens from the vault (super_admin only)
    pub fn withdraw_all(ctx: Context<Withdraw>) -> Result<()> {
        instructions::withdraw::withdraw_all_handler(ctx)
    }

    /// Purchase a dongle - NFT holders pay discounted price, normal users pay full price
    pub fn purchase_dongle(ctx: Context<PurchaseDongle>) -> Result<()> {
        instructions::purchase_dongle::handler(ctx)
    }
}
