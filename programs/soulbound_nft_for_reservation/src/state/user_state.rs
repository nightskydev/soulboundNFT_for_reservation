use anchor_lang::prelude::*;

#[account]
pub struct UserState {
    pub nft_address: Pubkey, // address of the soulbound NFT tied to user wallet
    pub nft_mint_date: i64,  // Unix timestamp when the NFT was minted
}

impl UserState {
    pub fn space() -> usize {
        8 +     // discriminator
        32 +    // nft_address
        8       // nft_mint_date
    }
}
