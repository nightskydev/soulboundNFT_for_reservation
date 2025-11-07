use anchor_lang::prelude::*;

#[account]
pub struct UserState {
    pub nft_address: Pubkey, // address of the soulbound NFT tied to user wallet
}

impl UserState {
    pub fn space() -> usize {
        8 + 32
    }
}
