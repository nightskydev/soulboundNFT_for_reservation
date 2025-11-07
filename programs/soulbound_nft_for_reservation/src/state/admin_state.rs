use anchor_lang::prelude::*;

#[account]
pub struct AdminState {
    pub bump: u8, // bump for PDA - not necessary
    pub admin: Pubkey, // admin wallet address - only admin can update this state like mint fee
    pub mint_fee: u64, // fee to mint nft - calculated in lamports
    pub current_reserved_count: u64, // current number of reserved NFTs
}

impl AdminState {
    pub fn space() -> usize {
        8 + 1 + 32 + 8 + 8
    }
}
