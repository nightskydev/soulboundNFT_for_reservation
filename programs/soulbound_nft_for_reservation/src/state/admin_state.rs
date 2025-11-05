use anchor_lang::prelude::*;

#[account]
pub struct AdminState {
    pub bump: u8, // 1
    pub admin: Pubkey,
    pub mint_fee: u64,
}

impl AdminState {
    pub fn space() -> usize {
        8 + 1 + 32 + 8
    }
}
