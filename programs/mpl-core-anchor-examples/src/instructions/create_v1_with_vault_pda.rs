use crate::error::WrapperError as err;
use crate::state::*;
use anchor_lang::prelude::*;
use mpl_core::types::{DataState, PluginAuthorityPair};
use mpl_core::ID as MPL_CORE_ID;
const PREFIX: &str = "mpl-core-execute";

#[derive(Accounts)]
pub struct CreateV1WithVaultPda<'info> {
    /// The address of the new asset.
    #[account(mut)]
    pub asset: Signer<'info>,

    /// The address of the new asset.
    #[account(mut)]
    pub asset_signer: Option<AccountInfo<'info>>,

    #[account(
        seeds = [b"state".as_ref(), b"admin".as_ref()],
        bump,
        has_one = treasury,
    )]
    pub admin_state: Box<Account<'info, AdminState>>,

    /// The collection to which the asset belongs.
    /// CHECK: Checked in mpl-core.
    #[account(mut)]
    pub collection: Option<AccountInfo<'info>>,

    /// The authority signing for creation.
    pub authority: Option<Signer<'info>>,

    /// The account paying for the storage fees.
    #[account(mut)]
    pub payer: Signer<'info>,

    /// The owner of the new asset. Defaults to the authority if not present.
    /// CHECK: Checked in mpl-core.
    pub owner: Option<AccountInfo<'info>>,

    /// The authority on the new asset.
    /// CHECK: Checked in mpl-core.
    pub update_authority: Option<AccountInfo<'info>>,

    /// The system program.
    pub system_program: Program<'info, System>,

    /// The SPL Noop program.
    /// CHECK: Checked in mpl-core.
    pub log_wrapper: Option<AccountInfo<'info>>,

    /// The MPL Core program.
    /// CHECK: Checked in mpl-core.
    #[account(address = mpl_core::ID)]
    pub mpl_core: AccountInfo<'info>,

    /// The treasury wallet to receive the fee.
    /// CHECK:
    #[account(mut)]
    pub treasury: AccountInfo<'info>,
}

#[derive(AnchorDeserialize, AnchorSerialize)]
pub struct CreateV1WithVaultPdaArgs {
    pub name: String,
    pub uri: String,
    // TODO: Add plugin_authority_pair
    pub plugins: Option<Vec<PluginAuthorityPair>>,
    pub lamports: u64, // <-- Add this line
    pub nft_type: u8,  // 0 = 5% fee, 1 = 4% fee
}

impl<'info> CreateV1WithVaultPda<'info> {
    pub fn handler(
        ctx: Context<CreateV1WithVaultPda>,
        args: CreateV1WithVaultPdaArgs,
    ) -> Result<()> {
        let admin_state_bump = ctx.bumps.admin_state; // Anchor auto-populates this if you use #[account(..., bump)]
        let admin_state_seeds: &[&[u8]] =
            &[b"state".as_ref(), b"admin".as_ref(), &[admin_state_bump]];

        mpl_core::instructions::CreateV1Cpi {
            asset: &ctx.accounts.asset.to_account_info(),
            collection: ctx.accounts.collection.as_ref(),
            authority: Some(ctx.accounts.admin_state.to_account_info().as_ref()),
            payer: &ctx.accounts.payer.to_account_info(),
            owner: ctx.accounts.owner.as_ref(),
            update_authority: ctx.accounts.update_authority.as_ref(),
            system_program: &ctx.accounts.system_program.to_account_info(),
            log_wrapper: ctx.accounts.log_wrapper.as_ref(),
            __program: &ctx.accounts.mpl_core,
            __args: mpl_core::instructions::CreateV1InstructionArgs {
                data_state: DataState::AccountState,
                name: args.name,
                uri: args.uri,
                plugins: args.plugins,
            },
        }
        .invoke_signed(&[admin_state_seeds])?;

        let (pda, _bump) = Pubkey::find_program_address(
            &[PREFIX.as_bytes(), ctx.accounts.asset.key.as_ref()],
            &MPL_CORE_ID,
        );

        match ctx.accounts.asset_signer.as_ref() {
            Some(asset_signer_info) => {
                if pda != *asset_signer_info.key {
                    return Err(err::InvalidExecutePda.into());
                }
            }
            None => {
                return Err(err::InvalidExecutePda.into());
            }
        }

        let payer = &ctx.accounts.payer.to_account_info();
        let asset_signer = ctx
            .accounts
            .asset_signer
            .as_ref()
            .ok_or(err::InvalidExecutePda)?;

        let treasury = &ctx.accounts.treasury;
        let transfer_amount = args.lamports;
        let fee_percent = match args.nft_type {
            0 => 5,
            1 => 4,
            _ => return Err(err::InvalidNftType.into()),
        };
        let fee = transfer_amount * fee_percent / 100;
        let total_amount = transfer_amount + fee;
        // Ensure payer has enough lamports (optional, for safety)
        require!(
            **payer.lamports.borrow() >= total_amount,
            err::InsufficientFunds
        );

        // Transfer to asset signer PDA
        let ix_asset = anchor_lang::solana_program::system_instruction::transfer(
            payer.key,
            asset_signer.key,
            transfer_amount,
        );
        anchor_lang::solana_program::program::invoke(
            &ix_asset,
            &[payer.clone(), asset_signer.clone()],
        )?;

        // Transfer fee to treasury
        let ix_fee =
            anchor_lang::solana_program::system_instruction::transfer(payer.key, treasury.key, fee);
        anchor_lang::solana_program::program::invoke(&ix_fee, &[payer.clone(), treasury.clone()])?;

        Ok(())
    }
}
