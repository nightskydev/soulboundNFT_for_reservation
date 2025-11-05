use crate::error::WrapperError as err;
use anchor_lang::prelude::*;
// const PREFIX: &str = "mpl-core-execute";
use crate::state::*;

use mpl_core::{
    accounts::{BaseAssetV1, BaseCollectionV1},
    fetch_plugin,
    instructions::{AddPluginV1CpiBuilder, RemovePluginV1CpiBuilder, UpdatePluginV1CpiBuilder},
    types::{
        Attribute, Attributes, FreezeDelegate, Plugin, PluginAuthority, PluginType, UpdateAuthority,
    },
    ID as MPL_CORE_ID,
};

#[derive(Accounts)]
pub struct GetReward<'info> {
    pub owner: Signer<'info>,
    /// The address of the new asset.
    #[account(
        seeds = [b"state".as_ref(), b"admin".as_ref()],
        bump,
    )]
    pub update_authority: Box<Account<'info, AdminState>>,
    // pub update_authority: Signer<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        mut,
        has_one = owner,
        constraint = asset.update_authority == UpdateAuthority::Collection(collection.key()),
    )]
    pub asset: Account<'info, BaseAssetV1>,
    #[account(
        mut,
        has_one = update_authority
    )]
    pub collection: Account<'info, BaseCollectionV1>,
    #[account(address = MPL_CORE_ID)]
    /// CHECK: this will be checked by core
    pub core_program: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

impl<'info> GetReward<'info> {
    pub fn handler(ctx: Context<GetReward>) -> Result<()> {
        let admin_state_bump = ctx.bumps.update_authority; // Anchor auto-populates this if you use #[account(..., bump)]
        let admin_state_seeds: &[&[u8]] =
            &[b"state".as_ref(), b"admin".as_ref(), &[admin_state_bump]];
        // Check if the asset has the attribute plugin already on
        match fetch_plugin::<BaseAssetV1, Attributes>(
            &ctx.accounts.asset.to_account_info(),
            mpl_core::types::PluginType::Attributes,
        ) {
            Ok((_, fetched_attribute_list, _)) => {
                let mut attribute_list: Vec<Attribute> = Vec::new();
                let mut is_initialized: bool = false;

                for attribute in fetched_attribute_list.attribute_list.iter() {
                    if attribute.key == "staked" {
                        require!(attribute.value != "0", err::NotStaked);
                        // staked_time = last_rewarded_time
                        //     .checked_add(Clock::get()?.unix_timestamp.checked_sub(attribute.value.parse::<i64>().map_err(|_| err::InvalidTimestamp)?).ok_or(err::Underflow)?)
                        //     .ok_or(err::Overflow)?;
                        is_initialized = true;
                    } else {
                        attribute_list.push(attribute.clone());
                    }
                }

                attribute_list.push(Attribute {
                    key: "last_rewarded_time".to_string(),
                    value: Clock::get()?.unix_timestamp.to_string(),
                });

                require!(is_initialized, err::StakingNotInitialized);

                UpdatePluginV1CpiBuilder::new(&ctx.accounts.core_program.to_account_info())
                    .asset(&ctx.accounts.asset.to_account_info())
                    .collection(Some(&ctx.accounts.collection.to_account_info()))
                    .payer(&ctx.accounts.payer.to_account_info())
                    .authority(Some(&ctx.accounts.update_authority.to_account_info()))
                    .system_program(&ctx.accounts.system_program.to_account_info())
                    .plugin(Plugin::Attributes(Attributes { attribute_list }))
                    .invoke_signed(&[admin_state_seeds])?;
            }
            Err(_) => {
                return Err(err::AttributesNotInitialized.into());
            }
        }

        Ok(())
    }
}
