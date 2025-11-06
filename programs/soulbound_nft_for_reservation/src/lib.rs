#![allow(unexpected_cfgs)]

use anchor_lang::prelude::*;

pub mod error;
pub mod state;
pub mod utils;
pub mod instructions;

pub use utils::*;
pub use instructions::*;

pub use crate::error::ProgramErrorCode;

declare_id!("GoNMgZJr4DorRcZVWSnrqLtjwgD3GUWMGgbLiZXW8Knd");

#[program]
pub mod soulbound_nft_for_reservation {
    use super::*;

    pub fn init_admin(ctx: Context<InitAdmin>, mint_fee: u64) -> Result<()> {
        instructions::init_admin::handler(ctx, mint_fee)
    }

    pub fn update_admin_info(ctx: Context<UpdateAdminInfo>, mint_fee: u64) -> Result<()> {
        instructions::update_admin::handler(ctx, mint_fee)
    }

    pub fn mint_nft(ctx: Context<MintNft>, name: String, symbol: String, uri: String) -> Result<()> {
        instructions::mint_nft::handler(ctx, name, symbol, uri)
    }

    pub fn burn_and_mint_new_nft(ctx: Context<BurnAndMintNewNft>, name: String, symbol: String, uri: String) -> Result<()> {
        instructions::burn_and_mint::handler(ctx, name, symbol, uri)
    }
}
