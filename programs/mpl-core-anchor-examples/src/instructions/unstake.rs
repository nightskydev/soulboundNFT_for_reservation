use crate::error::WrapperError as err;
use anchor_lang::prelude::*;
use mpl_core::types::{DataState, PluginAuthorityPair};
const PREFIX: &str = "mpl-core-execute";
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
pub struct Unstake<'info> {
    pub owner: Signer<'info>,
    pub update_authority: Signer<'info>,
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

impl<'info> Unstake<'info> {
    pub fn handler(ctx: Context<Unstake>) -> Result<()> {
       // Check if the asset has the attribute plugin already on
        match fetch_plugin::<BaseAssetV1, Attributes>(&ctx.accounts.asset.to_account_info(), mpl_core::types::PluginType::Attributes) {
            Ok((_, fetched_attribute_list, _)) => {
                let mut attribute_list: Vec<Attribute> = Vec::new();
                let mut is_initialized: bool = false;
                let mut staked_time: i64 = 0;

                for attribute in fetched_attribute_list.attribute_list.iter() {
                    if attribute.key == "staked" {
                        require!(attribute.value != "0", err::NotStaked);
                        attribute_list.push(Attribute { key: "staked".to_string(), value: 0.to_string() });
                        staked_time = staked_time
                            .checked_add(Clock::get()?.unix_timestamp.checked_sub(attribute.value.parse::<i64>().map_err(|_| err::InvalidTimestamp)?).ok_or(err::Underflow)?)
                            .ok_or(err::Overflow)?;
                        is_initialized = true;
                    } else if attribute.key == "staked_time" {
                        staked_time = staked_time
                            .checked_add(attribute.value.parse::<i64>().map_err(|_| err::InvalidTimestamp)?)
                            .ok_or(err::Overflow)?;
                    } else {
                        attribute_list.push(attribute.clone());
                    } 
                }

                attribute_list.push(Attribute { key: "staked_time".to_string(), value: staked_time.to_string() });

                require!(is_initialized, err::StakingNotInitialized);


                UpdatePluginV1CpiBuilder::new(&ctx.accounts.core_program.to_account_info())
                .asset(&ctx.accounts.asset.to_account_info())
                .collection(Some(&ctx.accounts.collection.to_account_info()))
                .payer(&ctx.accounts.payer.to_account_info())
                .authority(Some(&ctx.accounts.update_authority.to_account_info()))
                .system_program(&ctx.accounts.system_program.to_account_info())
                .plugin(Plugin::Attributes(Attributes{ attribute_list }))
                .invoke()?;

            }
            Err(_) => {
                return Err(err::AttributesNotInitialized.into());
            }
        }

        // Unfreeze the asset
        UpdatePluginV1CpiBuilder::new(&ctx.accounts.core_program.to_account_info())
        .asset(&ctx.accounts.asset.to_account_info())
        .collection(Some(&ctx.accounts.collection.to_account_info()))
        .payer(&ctx.accounts.payer.to_account_info())
        .authority(Some(&ctx.accounts.update_authority.to_account_info()))
        .system_program(&ctx.accounts.system_program.to_account_info())
        .plugin(Plugin::FreezeDelegate( FreezeDelegate{ frozen: false } ))
        .invoke()?;

        // Remove the FreezeDelegate Plugin
        RemovePluginV1CpiBuilder::new(&ctx.accounts.core_program)
        .asset(&ctx.accounts.asset.to_account_info())
        .collection(Some(&ctx.accounts.collection.to_account_info()))
        .payer(&ctx.accounts.payer)
        .authority(Some(&ctx.accounts.owner))
        .system_program(&ctx.accounts.system_program)
        .plugin_type(PluginType::FreezeDelegate)
        .invoke()?;
        
        Ok(())
    }
}
