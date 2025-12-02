use anchor_lang::prelude::*;

#[account]
pub struct AdminState {
    pub bump: u8, // bump for PDA - not necessary
    pub admin: Pubkey, // admin wallet address - only admin can update this state like mint fee
    pub withdraw_wallet: Pubkey, // wallet address to receive withdrawn funds
    pub mint_fee: u64, // fee to mint nft - in smallest token units (e.g., for USDC with 6 decimals, 1_000_000 = 1 USDC)
    pub current_reserved_count: u64, // current number of reserved NFTs
    pub payment_mint: Pubkey, // SPL token mint address for payment (e.g., USDC)
    pub max_supply: u64, // maximum number of NFTs that can be minted (0 = unlimited)
}

impl AdminState {
    pub fn space() -> usize {
        8 +     // discriminator
        1 +     // bump
        32 +    // admin
        32 +    // withdraw_wallet
        8 +     // mint_fee
        8 +     // current_reserved_count
        32 +    // payment_mint
        8       // max_supply
    }
}
