use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct CollectionState {
    pub collection_mint: Pubkey,
    #[max_len(100)]
    pub name: String,
    #[max_len(20)]
    pub symbol: String,
    #[max_len(200)]
    pub uri: String,
    pub created_at: i64,
    pub is_verified: bool,
}

impl CollectionState {
    pub fn space() -> usize {
        8 + // discriminator
        32 + // collection_mint
        4 + 100 + // name (String with max_len)
        4 + 20 + // symbol (String with max_len)
        4 + 200 + // uri (String with max_len)
        8 + // created_at
        1 // is_verified
    }
}
