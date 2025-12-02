use anchor_lang::prelude::*;

#[error_code]
pub enum ProgramErrorCode {
    #[msg("Invalid Mint account space")]
    InvalidMintAccountSpace,
    #[msg("Cant initialize metadata_pointer")]
    CantInitializeMetadataPointer,
    #[msg("User does not own this NFT")]
    UserDoesNotOwnNft,
    #[msg("User already has an NFT")]
    UserAlreadyHasNft,
    #[msg("Invalid token account")]
    InvalidTokenAccount,
    #[msg("Reserved count underflow")]
    ReservedCountUnderflow,
    #[msg("Invalid admin account")]
    InvalidAdminAccount,
    #[msg("Invalid payment mint - does not match admin_state.payment_mint")]
    InvalidPaymentMint,
    #[msg("Invalid payment token account")]
    InvalidPaymentTokenAccount,
    #[msg("Unauthorized - only admin can perform this action")]
    Unauthorized,
    #[msg("Invalid withdraw amount - must be greater than 0")]
    InvalidWithdrawAmount,
    #[msg("Insufficient vault balance for withdrawal")]
    InsufficientVaultBalance,
    #[msg("Max supply reached - no more NFTs can be minted")]
    MaxSupplyReached,
    #[msg("Invalid withdraw wallet - token account owner must match admin_state.withdraw_wallet")]
    InvalidWithdrawWallet,
}