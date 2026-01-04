use anchor_lang::prelude::*;
use super::CollectionType;

#[account]
pub struct UserState {
    pub user: Pubkey,                    // User's wallet address
    pub has_minted: bool,                // Whether user has minted an NFT
    pub collection_type: CollectionType, // Type of NFT minted
    pub mint_address: Pubkey,            // Address of the minted NFT
    pub minted_at: i64,                  // Timestamp when NFT was minted
    pub bump: u8,                        // PDA bump
}

impl UserState {
    pub fn space() -> usize {
        8 + // discriminator
        32 + // user
        1 + // has_minted
        1 + // collection_type (enum)
        32 + // mint_address
        8 + // minted_at
        1 // bump
    }
}
