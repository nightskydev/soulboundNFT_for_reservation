use anchor_lang::prelude::*;

use crate::state::*;
use crate::error::ProgramErrorCode;

#[derive(Accounts)]
pub struct UpdateAdminInfo<'info> {
    /// Only super_admin can update admin settings
    #[account(mut)]
    pub super_admin: Signer<'info>,
    #[account(
        mut,
        seeds = [b"admin_state".as_ref()],
        bump,
        constraint = admin_state.super_admin == super_admin.key() @ ProgramErrorCode::Unauthorized
     )]
    pub admin_state: Box<Account<'info, AdminState>>,
}

pub fn update_mint_fee_handler(ctx: Context<UpdateAdminInfo>, collection_type: crate::state::CollectionType, mint_fee: u64) -> Result<()> {
    require!(mint_fee > 0, ProgramErrorCode::InvalidMintFee);
    
    let collection_config = ctx.accounts.admin_state.get_collection_config_mut(collection_type);
    collection_config.mint_fee = mint_fee;
    
    msg!("Collection {:?} mint fee updated to: {}", collection_type, mint_fee);
    Ok(())
}

pub fn update_max_supply_handler(ctx: Context<UpdateAdminInfo>, collection_type: crate::state::CollectionType, max_supply: u64) -> Result<()> {
    let collection_config = ctx.accounts.admin_state.get_collection_config(collection_type);
    
    // Validate max_supply is not below current reserved count (0 means unlimited)
    require!(
        max_supply == 0 || max_supply >= collection_config.current_reserved_count,
        ProgramErrorCode::InvalidMaxSupply
    );
    
    let collection_config_mut = ctx.accounts.admin_state.get_collection_config_mut(collection_type);
    collection_config_mut.max_supply = max_supply;
    
    msg!("Collection {:?} max supply updated to: {}", collection_type, max_supply);
    Ok(())
}

pub fn update_mint_start_date_handler(ctx: Context<UpdateAdminInfo>, mint_start_date: i64) -> Result<()> {
    ctx.accounts.admin_state.mint_start_date = mint_start_date;
    msg!("Mint start date updated to: {}", mint_start_date);
    Ok(())
}

pub fn update_collection_mint_handler(ctx: Context<UpdateAdminInfo>, collection_type: crate::state::CollectionType, collection_mint: Pubkey) -> Result<()> {
    // Validate that collection_mint is not empty
    require!(
        collection_mint != Pubkey::default(),
        ProgramErrorCode::InvalidCollection
    );

    let collection_config = ctx.accounts.admin_state.get_collection_config_mut(collection_type);
    collection_config.collection_mint = collection_mint;
    
    msg!("Collection {:?} mint updated to: {}", collection_type, collection_mint);
    Ok(())
}

pub fn update_super_admin_handler(ctx: Context<UpdateAdminInfo>, new_super_admin: Pubkey) -> Result<()> {
    // Validate that new_super_admin is not empty
    require!(
        new_super_admin != Pubkey::default(),
        ProgramErrorCode::InvalidSuperAdmin
    );

    // Validate that new admin is different from current admin
    require!(
        new_super_admin != ctx.accounts.admin_state.super_admin,
        ProgramErrorCode::SameSuperAdmin
    );

    let old_admin = ctx.accounts.admin_state.super_admin;
    ctx.accounts.admin_state.super_admin = new_super_admin;

    msg!("Super admin updated:");
    msg!("  From: {}", old_admin);
    msg!("  To: {}", new_super_admin);

    Ok(())
}
