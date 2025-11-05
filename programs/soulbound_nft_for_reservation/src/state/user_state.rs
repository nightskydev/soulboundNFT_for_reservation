use anchor_lang::prelude::*;

#[account]
pub struct UserState {
    pub nft_address: Pubkey,
}

impl UserState {
    pub fn space() -> usize {
        8 + 32
    }
}
