use anchor_lang::prelude::*;

#[account]
pub struct AdminState {
    pub risk_based_apy: [u8; 3], 
    pub staking_period_range: [u64; 2], // in seconds
    pub withdraw_available_after: u64, // in seconds
    // The mint of the token used for staking rewards
    pub token_mint: Pubkey,
    pub admin: Pubkey,
    pub treasury: Pubkey,
    pub collection_update_authority: Pubkey,
}

impl AdminState {
    pub fn space() -> usize {
        8 + 3 + 8 * 2 + 8 + 32 + 32 + 32 + 32
    }
}
