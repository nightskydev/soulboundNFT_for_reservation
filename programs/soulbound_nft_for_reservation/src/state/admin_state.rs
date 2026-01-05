use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq)]
pub enum CollectionType {
    OG,
    Regular,
    Basic,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug)]
pub struct CollectionConfig {
    pub collection_mint: Pubkey,         // Collection mint address
    pub mint_fee: u64,                   // Fee to mint NFT in this collection
    pub max_supply: u64,                 // Maximum supply (0 = unlimited)
    pub current_reserved_count: u64,     // Current minted count
    pub admin_mint_limit: u64,           // Maximum NFTs admin can mint (0 = admin cannot mint)
    pub current_admin_mint_count: u64,   // Current admin minted count
}

impl CollectionConfig {
    pub fn new(collection_mint: Pubkey, mint_fee: u64, max_supply: u64, admin_mint_limit: u64) -> Self {
        Self {
            collection_mint,
            mint_fee,
            max_supply,
            current_reserved_count: 0,
            admin_mint_limit,
            current_admin_mint_count: 0,
        }
    }

    pub const fn space() -> usize {
        32 +        // collection_mint
        8 +         // mint_fee
        8 +         // max_supply
        8 +         // current_reserved_count
        8 +         // admin_mint_limit
        8           // current_admin_mint_count
    }
}

#[account]
pub struct AdminState {
    pub bump: u8,                       // bump for PDA
    pub super_admin: Pubkey,            // super admin - can update all admin parameters
    pub withdraw_wallet: Pubkey,        // wallet address to receive withdrawn funds
    pub payment_mint: Pubkey,           // SPL token mint address for payment (e.g., USDC) - SHARED
    pub mint_start_date: i64,           // Unix timestamp when minting starts (0 = no restriction) - SHARED

    // Three collection configurations
    pub og_collection: CollectionConfig,      // OG collection config
    pub regular_collection: CollectionConfig, // Regular collection config
    pub basic_collection: CollectionConfig,   // Basic collection config
}

impl AdminState {
    pub fn space() -> usize {
        8 +                             // discriminator
        1 +                             // bump
        32 +                            // super_admin
        32 +                            // withdraw_wallet
        32 +                            // payment_mint
        8 +                             // mint_start_date
        CollectionConfig::space() +     // og_collection
        CollectionConfig::space() +     // regular_collection
        CollectionConfig::space()       // basic_collection
    }

    pub fn get_collection_config(&self, collection_type: CollectionType) -> &CollectionConfig {
        match collection_type {
            CollectionType::OG => &self.og_collection,
            CollectionType::Regular => &self.regular_collection,
            CollectionType::Basic => &self.basic_collection,
        }
    }

    pub fn get_collection_config_mut(&mut self, collection_type: CollectionType) -> &mut CollectionConfig {
        match collection_type {
            CollectionType::OG => &mut self.og_collection,
            CollectionType::Regular => &mut self.regular_collection,
            CollectionType::Basic => &mut self.basic_collection,
        }
    }
}
