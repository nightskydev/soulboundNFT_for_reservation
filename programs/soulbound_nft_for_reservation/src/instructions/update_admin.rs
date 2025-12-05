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

pub fn update_mint_fee_handler(ctx: Context<UpdateAdminInfo>, mint_fee: u64) -> Result<()> {
    ctx.accounts.admin_state.mint_fee = mint_fee;
    msg!("Mint fee updated to: {}", mint_fee);
    Ok(())
}

pub fn update_max_supply_handler(ctx: Context<UpdateAdminInfo>, max_supply: u64) -> Result<()> {
    // Validate max_supply is not below current reserved count (0 means unlimited)
    require!(
        max_supply == 0 || max_supply >= ctx.accounts.admin_state.current_reserved_count,
        ProgramErrorCode::InvalidMaxSupply
    );
    
    ctx.accounts.admin_state.max_supply = max_supply;
    msg!("Max supply updated to: {}", max_supply);
    Ok(())
}

pub fn update_mint_start_date_handler(ctx: Context<UpdateAdminInfo>, mint_start_date: i64) -> Result<()> {
    ctx.accounts.admin_state.mint_start_date = mint_start_date;
    msg!("Mint start date updated to: {}", mint_start_date);
    Ok(())
}

pub fn update_dongle_price_nft_holder_handler(ctx: Context<UpdateAdminInfo>, dongle_price_nft_holder: u64) -> Result<()> {
    ctx.accounts.admin_state.dongle_price_nft_holder = dongle_price_nft_holder;
    msg!("Dongle price for NFT holders updated to: {}", dongle_price_nft_holder);
    Ok(())
}

pub fn update_dongle_price_normal_handler(ctx: Context<UpdateAdminInfo>, dongle_price_normal: u64) -> Result<()> {
    ctx.accounts.admin_state.dongle_price_normal = dongle_price_normal;
    msg!("Dongle price for normal users updated to: {}", dongle_price_normal);
    Ok(())
}

pub fn update_purchase_started_handler(ctx: Context<UpdateAdminInfo>, purchase_started: bool) -> Result<()> {
    ctx.accounts.admin_state.purchase_started = purchase_started;
    msg!("Purchase started flag updated to: {}", purchase_started);
    Ok(())
}

pub fn update_super_admin_handler(ctx: Context<UpdateAdminInfo>, new_super_admin: Pubkey) -> Result<()> {
    // Validate that new_super_admin is not empty
    require!(
        new_super_admin != Pubkey::default(),
        ProgramErrorCode::InvalidSuperAdmin
    );

    let old_admin = ctx.accounts.admin_state.super_admin;
    ctx.accounts.admin_state.super_admin = new_super_admin;

    msg!("Super admin updated:");
    msg!("  From: {}", old_admin);
    msg!("  To: {}", new_super_admin);

    Ok(())
}
