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
}