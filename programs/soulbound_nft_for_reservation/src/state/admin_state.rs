use anchor_lang::prelude::*;

#[account]
pub struct AdminState {
    pub bump: u8, // bump for PDA
    pub super_admin: Pubkey, // super admin - can update all admin parameters
    pub withdraw_wallet: Pubkey, // wallet address to receive withdrawn funds
    pub mint_fee: u64, // fee to mint nft - in smallest token units
    pub current_reserved_count: u64, // current number of reserved NFTs
    pub payment_mint: Pubkey, // SPL token mint address for payment (e.g., USDC)
    pub max_supply: u64, // maximum number of NFTs that can be minted (0 = unlimited)
    pub mint_start_date: i64, // Unix timestamp when minting starts (0 = no restriction)
    
    // Dongle pricing
    pub dongle_price_nft_holder: u64, // dongle price for soulbound NFT holders (e.g., 100 USDC)
    pub dongle_price_normal: u64, // dongle price for normal users without NFT (e.g., 499 USDC)
    pub purchase_started: bool, // flag to enable/disable dongle purchases

    // NFT Collections
    pub og_collection: Pubkey, // OG NFT collection for early adopters (transferable)
    pub dongle_proof_collection: Pubkey, // Dongle proof NFT collection (transferable)
}

impl AdminState {
    pub fn space() -> usize {
        8 +         // discriminator
        1 +         // bump
        32 +        // super_admin
        32 +        // withdraw_wallet
        8 +         // mint_fee
        8 +         // current_reserved_count
        32 +        // payment_mint
        8 +         // max_supply
        8 +         // mint_start_date
        8 +         // dongle_price_nft_holder
        8 +         // dongle_price_normal
        1 +         // purchase_started
        32 +        // og_collection
        32          // dongle_proof_collection
    }
}
