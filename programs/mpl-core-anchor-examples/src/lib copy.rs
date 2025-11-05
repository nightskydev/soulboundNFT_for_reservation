#![allow(unexpected_cfgs)]

use anchor_lang::{prelude::*, system_program};
use anchor_spl::{
    associated_token::{self, AssociatedToken}, token_2022, token_2022::Burn, token_interface::{spl_token_2022::instruction::AuthorityType, Token2022}
};
use solana_program::program::{invoke, invoke_signed};
use spl_token_2022::{extension::ExtensionType, instruction as token_instruction, state::Mint};

pub mod constants;
pub mod error;
pub mod instructions;
pub mod state;
pub mod utils;

use anchor_lang::prelude::*;

pub use constants::*;
pub use instructions::*;

declare_id!("EjZL47GfF2EfNxhwPw1vNGPPVXMDdXBVcu1JCnux5d3L");

#[program]
pub mod mpl_core_anchor_wrapper {
    use super::*;

    pub fn initialize_admin(
        ctx: Context<InitializeAdmin>,
        args: InitializeAdminArgs,
    ) -> Result<()> {
        initialize_admin::InitializeAdmin::handler(ctx, args)
    }

    pub fn init_escrow_v1(ctx: Context<InitEscrowV1Ctx>, ix: InitEscrowV1Ix) -> Result<()> {
        init_escrow::handler_init_escrow_v1(ctx, ix)
    }

    pub fn create_v1(ctx: Context<CreateV1>, args: CreateV1Args) -> Result<()> {
        create_v1::CreateV1::handler(ctx, args)
    }

    pub fn release_v1(ctx: Context<ReleaseV1Ctx>) -> Result<()> {
        release::handler_release_v1(ctx)
    }

    pub fn capture_v1(ctx: Context<CaptureV1Ctx>) -> Result<()> {
        capture::handler_capture_v1(ctx)
    }

    pub fn create_v1_with_vault_pda(
        ctx: Context<CreateV1WithVaultPda>,
        args: CreateV1WithVaultPdaArgs,
    ) -> Result<()> {
        create_v1_with_vault_pda::CreateV1WithVaultPda::handler(ctx, args)
    }

    pub fn stake(ctx: Context<Stake>, args: StakeArgs) -> Result<()> {
        stake::Stake::handler(ctx, args)
    }

    pub fn get_reward(ctx: Context<GetReward>) -> Result<()> {
        get_reward::GetReward::handler(ctx)
    }

    pub fn unstake(ctx: Context<Unstake>) -> Result<()> {
        unstake::Unstake::handler(ctx)
    }

    pub fn create_collection_v1(
        ctx: Context<CreateCollectionV1>,
        args: CreateCollectionV1Args,
    ) -> Result<()> {
        create_collection_v1::CreateCollectionV1::handler(ctx, args)
    }

    pub fn add_plugin_v1(ctx: Context<AddPluginV1>, args: AddPluginV1Args) -> Result<()> {
        add_plugin_v1::AddPluginV1::handler(ctx, args)
    }

    pub fn add_collection_plugin_v1(
        ctx: Context<AddCollectionPluginV1>,
        args: AddCollectionPluginV1Args,
    ) -> Result<()> {
        add_collection_plugin_v1::AddCollectionPluginV1::handler(ctx, args)
    }

    pub fn remove_plugin_v1(ctx: Context<RemovePluginV1>, args: RemovePluginV1Args) -> Result<()> {
        remove_plugin_v1::RemovePluginV1::handler(ctx, args)
    }

    pub fn remove_collection_plugin_v1(
        ctx: Context<RemoveCollectionPluginV1>,
        args: RemoveCollectionPluginV1Args,
    ) -> Result<()> {
        remove_collection_plugin_v1::RemoveCollectionPluginV1::handler(ctx, args)
    }

    pub fn update_plugin_v1(ctx: Context<UpdatePluginV1>, args: UpdatePluginV1Args) -> Result<()> {
        update_plugin_v1::UpdatePluginV1::handler(ctx, args)
    }

    pub fn update_collection_plugin_v1(
        ctx: Context<UpdateCollectionPluginV1>,
        args: UpdateCollectionPluginV1Args,
    ) -> Result<()> {
        update_collection_plugin_v1::UpdateCollectionPluginV1::handler(ctx, args)
    }

    pub fn transfer_v1(ctx: Context<TransferV1>, args: TransferV1Args) -> Result<()> {
        transfer_v1::TransferV1::handler(ctx, args)
    }
}
