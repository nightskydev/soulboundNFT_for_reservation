#![allow(unexpected_cfgs)]

use anchor_lang::prelude::*;

pub mod error;
pub mod state;
pub mod utils;
pub mod instructions;

pub use utils::*;
pub use instructions::*;

pub use crate::error::ProgramErrorCode;

declare_id!("AzcZ8LcBKu1tT8ahYYqVTbUpfaonJmkGFNnPajYKSW9L");

#[program]
pub mod soulbound_nft_for_reservation {
    use super::*;

    /// Initialize admin state with super_admin (signer)
    pub fn init_admin(
        ctx: Context<InitAdmin>,
        // OG Collection parameters
        og_collection_mint: Pubkey,
        og_mint_fee: u64,
        og_max_supply: u64,
        // Regular Collection parameters
        regular_collection_mint: Pubkey,
        regular_mint_fee: u64,
        regular_max_supply: u64,
        // Basic Collection parameters
        basic_collection_mint: Pubkey,
        basic_mint_fee: u64,
        basic_max_supply: u64,
        // Shared parameters
        withdraw_wallet: Pubkey,
        mint_start_date: i64,
    ) -> Result<()> {
        instructions::init_admin::handler(
            ctx,
            og_collection_mint, og_mint_fee, og_max_supply,
            regular_collection_mint, regular_mint_fee, regular_max_supply,
            basic_collection_mint, basic_mint_fee, basic_max_supply,
            withdraw_wallet, mint_start_date
        )
    }

    /// Update mint fee for a specific collection (super_admin only)
    pub fn update_mint_fee(ctx: Context<UpdateAdminInfo>, collection_type: state::CollectionType, mint_fee: u64) -> Result<()> {
        instructions::update_admin::update_mint_fee_handler(ctx, collection_type, mint_fee)
    }

    /// Update max supply for a specific collection (super_admin only)
    pub fn update_max_supply(ctx: Context<UpdateAdminInfo>, collection_type: state::CollectionType, max_supply: u64) -> Result<()> {
        instructions::update_admin::update_max_supply_handler(ctx, collection_type, max_supply)
    }

    /// Update mint start date - shared across all collections (super_admin only)
    pub fn update_mint_start_date(ctx: Context<UpdateAdminInfo>, mint_start_date: i64) -> Result<()> {
        instructions::update_admin::update_mint_start_date_handler(ctx, mint_start_date)
    }

    /// Update collection mint address for a specific collection (super_admin only)
    pub fn update_collection_mint(ctx: Context<UpdateAdminInfo>, collection_type: state::CollectionType, collection_mint: Pubkey) -> Result<()> {
        instructions::update_admin::update_collection_mint_handler(ctx, collection_type, collection_mint)
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

    /// Mint an NFT in a specific collection
    pub fn mint_nft(ctx: Context<MintNft>, collection_type: state::CollectionType, name: String, symbol: String, uri: String) -> Result<()> {
        instructions::mint_nft::handler(ctx, collection_type, name, symbol, uri)
    }

    pub fn update_nft_metadata(ctx: Context<UpdateNftMetadata>, name: Option<String>, symbol: Option<String>, uri: Option<String>) -> Result<()> {
        instructions::update_nft_metadata::handler(ctx, name, symbol, uri)
    }

    /// Burn an NFT from a specific collection
    pub fn burn_nft(ctx: Context<BurnNft>, collection_type: state::CollectionType) -> Result<()> {
        instructions::burn_nft::handler(ctx, collection_type)
    }

    /// Withdraw payment tokens from the vault (super_admin only)
    pub fn withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
        instructions::withdraw::handler(ctx, amount)
    }

    /// Withdraw all payment tokens from the vault (super_admin only)
    pub fn withdraw_all(ctx: Context<Withdraw>) -> Result<()> {
        instructions::withdraw::withdraw_all_handler(ctx)
    }
}
