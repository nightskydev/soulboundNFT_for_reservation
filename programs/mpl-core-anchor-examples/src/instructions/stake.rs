use crate::error::WrapperError as err;
use anchor_lang::prelude::*;
const PREFIX: &str = "mpl-core-execute";
use crate::state::*;

use anchor_lang::solana_program::{program::invoke_signed, system_instruction};

use mpl_core::{
    accounts::{BaseAssetV1, BaseCollectionV1},
    fetch_plugin,
    instructions::{AddPluginV1CpiBuilder, ExecuteV1CpiBuilder, UpdatePluginV1CpiBuilder},
    types::{
        Attribute, Attributes, FreezeDelegate, Plugin, PluginAuthority, PluginType, UpdateAuthority,
    },
    ID as MPL_CORE_ID,
};

#[derive(Accounts)]
pub struct Stake<'info> {
    pub owner: Signer<'info>,
    /// The address of the new asset.
    #[account(
        seeds = [b"state".as_ref(), b"admin".as_ref()],
        bump,
        has_one = treasury,
    )]
    pub update_authority: Box<Account<'info, AdminState>>,

    /// CHECK:
    #[account(mut)]
    pub asset_signer: AccountInfo<'info>,

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
    /// CHECK: This is the treasury wallet that will receive rewards
    #[account(mut)]
    pub treasury: UncheckedAccount<'info>,
    #[account(address = MPL_CORE_ID)]
    /// CHECK: this will be checked by core
    pub core_program: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(AnchorDeserialize, AnchorSerialize)]
pub struct StakeArgs {
    pub staking_period: u64,       // in seconds
    pub risk_type: u8,             // 0 = low risk, 1 = medium risk, 2 = high risk
    pub instruction_data: Vec<u8>, // additional data for the instruction
}

impl<'info> Stake<'info> {
    pub fn handler(ctx: Context<Stake>, args: StakeArgs) -> Result<()> {
        let admin_state = &ctx.accounts.update_authority;
        let min_period = admin_state.staking_period_range[0];
        let max_period = admin_state.staking_period_range[1];
        require!(
            args.staking_period >= min_period && args.staking_period <= max_period,
            err::InvalidStakingPeriod
        );

        let admin_state_bump = ctx.bumps.update_authority; // Anchor auto-populates this if you use #[account(..., bump)]
        let admin_state_seeds: &[&[u8]] =
            &[b"state".as_ref(), b"admin".as_ref(), &[admin_state_bump]];
        // Check if the asset has the attribute plugin already on
        match fetch_plugin::<BaseAssetV1, Attributes>(
            &ctx.accounts.asset.to_account_info(),
            mpl_core::types::PluginType::Attributes,
        ) {
            Ok((_, fetched_attribute_list, _)) => {
                // If yes, check if the asset is already staked, and if the staking attribute are already initialized
                let mut attribute_list: Vec<Attribute> = Vec::new();
                let mut is_initialized: bool = false;

                for attribute in fetched_attribute_list.attribute_list {
                    if attribute.key == "staked" {
                        require!(attribute.value == "0", err::AlreadyStaked);
                        attribute_list.push(Attribute {
                            key: "staked".to_string(),
                            value: Clock::get()?.unix_timestamp.to_string(),
                        });
                        attribute_list.push(Attribute {
                            key: "staking_period".to_string(),
                            value: args.staking_period.to_string(),
                        });
                        attribute_list.push(Attribute {
                            key: "risk_type".to_string(),
                            value: args.risk_type.to_string(),
                        });
                        is_initialized = true;
                    } else {
                        attribute_list.push(attribute);
                    }
                }

                if !is_initialized {
                    attribute_list.push(Attribute {
                        key: "staked".to_string(),
                        value: Clock::get()?.unix_timestamp.to_string(),
                    });
                    attribute_list.push(Attribute {
                        key: "last_rewarded_time".to_string(),
                        value: Clock::get()?.unix_timestamp.to_string(),
                    });
                    attribute_list.push(Attribute {
                        key: "staking_period".to_string(),
                        value: args.staking_period.to_string(),
                    });
                    attribute_list.push(Attribute {
                        key: "risk_type".to_string(),
                        value: args.risk_type.to_string(),
                    });
                }

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
                // If not, add the attribute plugin to the asset
                AddPluginV1CpiBuilder::new(&ctx.accounts.core_program.to_account_info())
                    .asset(&ctx.accounts.asset.to_account_info())
                    .collection(Some(&ctx.accounts.collection.to_account_info()))
                    .payer(&ctx.accounts.payer.to_account_info())
                    .authority(Some(&ctx.accounts.update_authority.to_account_info()))
                    .system_program(&ctx.accounts.system_program.to_account_info())
                    .plugin(Plugin::Attributes(Attributes {
                        attribute_list: vec![
                            Attribute {
                                key: "staked".to_string(),
                                value: Clock::get()?.unix_timestamp.to_string(),
                            },
                            Attribute {
                                key: "last_rewarded_time".to_string(),
                                value: Clock::get()?.unix_timestamp.to_string(),
                            },
                            Attribute {
                                key: "staking_period".to_string(),
                                value: args.staking_period.to_string(),
                            },
                            Attribute {
                                key: "risk_type".to_string(),
                                value: args.risk_type.to_string(),
                            },
                        ],
                    }))
                    .init_authority(PluginAuthority::UpdateAuthority)
                    .invoke_signed(&[admin_state_seeds])?;
            }
        }

        // Freeze the asset
        AddPluginV1CpiBuilder::new(&ctx.accounts.core_program.to_account_info())
            .asset(&ctx.accounts.asset.to_account_info())
            .collection(Some(&ctx.accounts.collection.to_account_info()))
            .payer(&ctx.accounts.payer.to_account_info())
            .authority(Some(&ctx.accounts.owner.to_account_info()))
            .system_program(&ctx.accounts.system_program.to_account_info())
            .plugin(Plugin::FreezeDelegate(FreezeDelegate { frozen: true }))
            .init_authority(PluginAuthority::UpdateAuthority)
            .invoke_signed(&[admin_state_seeds])?;

        let (pda, asset_signer_bump) = Pubkey::find_program_address(
            &[
                PREFIX.as_bytes(),
                ctx.accounts.asset.to_account_info().key().as_ref(),
            ],
            &MPL_CORE_ID,
        );

        if pda != *ctx.accounts.asset_signer.key {
            return Err(err::InvalidExecutePda.into());
        }

        let instruction = system_instruction::transfer(
            &ctx.accounts.asset_signer.key,
            &ctx.accounts.treasury.key,
            1000,
        );

        let asset_signer_seeds: &[&[u8]] = &[
            PREFIX.as_bytes(),
            ctx.accounts.asset.to_account_info().key.as_ref(),
            &[asset_signer_bump],
        ];

        // let instruction_data = instruction.data.try_to_vec().unwrap();
        // let mut data = ExecuteV1InstructionData::new().try_to_vec().unwrap();
        // let mut __args = ExecuteV1InstructionArgs {
        //     instruction_data: Some(instruction_data.clone())
        //         .expect("instruction_data is not set"),
        // };
        // let mut args = __args.try_to_vec().unwrap();
        // data.append(&mut args);
        msg!("Executing instruction: {:?}", instruction.data);

        // panic!("This is a test panic to check the instruction execution flow");

        // ExecuteV1CpiBuilder::new(&ctx.accounts.core_program.to_account_info())
        //     .asset(&ctx.accounts.asset.to_account_info())
        //     .collection(Some(&ctx.accounts.collection.to_account_info()))
        //     .asset_signer(&ctx.accounts.asset_signer)
        //     .payer(&ctx.accounts.payer.to_account_info())
        //     .authority(Some(&ctx.accounts.owner.to_account_info()))
        //     .system_program(&ctx.accounts.system_program.to_account_info())
        //     .program_id(&ctx.accounts.system_program.to_account_info())
        //     .instruction_data(instruction.data)
        //     .add_remaining_account(&ctx.accounts.asset_signer, true, true)
        //     .add_remaining_account(&ctx.accounts.owner, false, true)
        //     // .add_remaining_account(&ctx.accounts.treasury, true, false)
        //     .invoke_signed(&[asset_signer_seeds])?;

        // ExecuteV1Cpi {
        //     asset: &ctx.accounts.asset.to_account_info(),
        //     asset_signer: &ctx.accounts.asset_signer,
        //     program_id: &&ctx.accounts.core_program.to_account_info(),
        //     collection: Some(&ctx.accounts.collection.to_account_info()),
        //     authority: Some(&ctx.accounts.owner.to_account_info()),
        //     payer: &ctx.accounts.payer.to_account_info(),
        //     system_program: &ctx.accounts.system_program.to_account_info(),
        //     __program: &ctx.accounts.system_program.to_account_info(),
        //     __args: ExecuteV1InstructionArgs {
        //         instruction_data: instruction_data.clone(),
        //     },
        // }
        // .invoke()?;

        Ok(())
    }
}
