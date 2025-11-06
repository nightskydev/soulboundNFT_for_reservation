use anchor_lang::prelude::*;

use crate::state::*;

use anchor_spl::associated_token::{self, AssociatedToken};
use anchor_spl::token_2022::spl_token_2022::extension::{
    BaseStateWithExtensions, StateWithExtensions,
};
use anchor_spl::token_2022::spl_token_2022::{
    self, extension::ExtensionType, instruction::AuthorityType,
};
use anchor_spl::token_2022::{get_account_data_size, GetAccountDataSize, Token2022};
use anchor_spl::token_2022_extensions::spl_token_metadata_interface;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};
use solana_program::program::{invoke, invoke_signed};
use solana_program::system_instruction::transfer;

use crate::utils::safe_create_account;

#[derive(Accounts)]
pub struct CreateSoulboundNFT<'info> {
     #[account(mut)]
    pub signer: Signer<'info>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token2022>,
    /// CHECK: We will create this one for the user
    #[account(mut)]
    pub token_account: AccountInfo<'info>,
    #[account(mut)]
    pub mint: Signer<'info>,
    pub rent: Sysvar<'info, Rent>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    #[account(  
        seeds = [b"admin_state".as_ref()],
        bump,
        constraint = admin_state.admin == admin.key()
    )]
    pub admin_state: Account<'info, AdminState >,
    #[account(
        init_if_needed,
        seeds = [b"user_state".as_ref(), signer.key().as_ref()],
        bump,
        payer = signer,
        space = UserState::space()
    )]
    pub user_state: Box<Account<'info, UserState>>,
    /// CHECK: This is not dangerous because we don't read or write from this account
    #[account(mut)]
    pub admin: AccountInfo<'info>,
}

pub fn handler(ctx: Context<CreateSoulboundNFT>, name: String, symbol: String, uri: String) -> Result<()> {
    //============================= initialize mint =============================
    let mut extensions = vec![ExtensionType::MintCloseAuthority];
        extensions.push(ExtensionType::MetadataPointer);
        extensions.push(ExtensionType::NonTransferable);

    let space =
        ExtensionType::try_calculate_account_len::<spl_token_2022::state::Mint>(&extensions)?;

    let lamports = Rent::get()?.minimum_balance(space);

    let authority = ctx.accounts.admin_state.key();

    // create account
    safe_create_account(
        ctx.accounts.system_program.to_account_info(),
        ctx.accounts.signer.to_account_info(),
        ctx.accounts.mint.to_account_info(),
        &ctx.accounts.token_program.key(),
        lamports,
        space as u64,
        &[],
    )?;

    // initialize MintCloseAuthority extension
    // authority: Position account (PDA)
    invoke(
        &spl_token_2022::instruction::initialize_mint_close_authority(
            ctx.accounts.token_program.key,
            ctx.accounts.mint.key,
            Some(&authority.key()),
        )?,
        &[
            ctx.accounts.mint.to_account_info(),
            ctx.accounts.admin_state.to_account_info(),
            ctx.accounts.token_program.to_account_info(),
        ],
    )?;

    // TokenMetadata extension requires MetadataPointer extension to be initialized
        // initialize MetadataPointer extension
    invoke(
        &spl_token_2022::extension::metadata_pointer::instruction::initialize(
            ctx.accounts.token_program.key,
            ctx.accounts.mint.key,
            Some(ctx.accounts.admin_state.key()),
            Some(ctx.accounts.mint.key()),
        )?,
        &[
            ctx.accounts.mint.to_account_info(),
            ctx.accounts.admin_state.to_account_info(),
            ctx.accounts.token_program.to_account_info(),
        ],
    )?;

    // initialize NonTransferable extension
    invoke(
        &spl_token_2022::instruction::initialize_non_transferable_mint(
            ctx.accounts.token_program.key,
            ctx.accounts.mint.key,
        )?,
        &[
            ctx.accounts.mint.to_account_info(),
            ctx.accounts.token_program.to_account_info(),
        ],
    )?;

    // initialize Mint
    // mint authority: Position account (PDA) (will be removed in the transaction)
    // freeze authority: Position account (PDA) (reserved for future improvements)
    invoke(
        &spl_token_2022::instruction::initialize_mint2(
            ctx.accounts.token_program.key,
            ctx.accounts.mint.key,
            &authority.key(),
            Some(&authority.key()),
            0,
        )?,
        &[
            ctx.accounts.mint.to_account_info(),
            ctx.accounts.admin_state.to_account_info(),
            ctx.accounts.token_program.to_account_info(),
        ],
    )?;

    // ============================= initialize token metadata extension =============================
    let mint_authority = ctx.accounts.admin_state.to_account_info();

    let metadata = spl_token_metadata_interface::state::TokenMetadata {
        name,
        symbol,
        uri,
        ..Default::default()
    };

    // we need to add rent for TokenMetadata extension to reallocate space
    let token_mint_data = ctx.accounts.mint.try_borrow_data()?;
    let token_mint_unpacked =
        StateWithExtensions::<spl_token_2022::state::Mint>::unpack(&token_mint_data)?;
    let new_account_len = token_mint_unpacked
        .try_get_new_account_len_for_variable_len_extension::<spl_token_metadata_interface::state::TokenMetadata>(&metadata)?;

    let new_rent_exempt_minimum = Rent::get()?.minimum_balance(new_account_len);
    let additional_rent = new_rent_exempt_minimum.saturating_sub(ctx.accounts.mint.lamports());
    drop(token_mint_data); // CPI call will borrow the account data

    // transfer additional rent
    invoke(
        &transfer(ctx.accounts.signer.key, ctx.accounts.mint.key, additional_rent),
        &[
            ctx.accounts.signer.to_account_info(),
            ctx.accounts.mint.to_account_info(),
            ctx.accounts.system_program.to_account_info(),
        ],
    )?;

    let admin_seeds = [
        b"admin_state".as_ref(),
        &[ctx.bumps.admin_state],
    ];

    // initialize TokenMetadata extension
    // update authority: WP_NFT_UPDATE_AUTH
    invoke_signed(
        &spl_token_metadata_interface::instruction::initialize(
            ctx.accounts.token_program.key,
            ctx.accounts.mint.key,
            ctx.accounts.admin_state.to_account_info().key,
            ctx.accounts.mint.key,
            &mint_authority.key(),
            metadata.name,
            metadata.symbol,
            metadata.uri,
        ),
        &[
            ctx.accounts.mint.to_account_info(),
            mint_authority.to_account_info(),
            ctx.accounts.admin_state.to_account_info(),
            ctx.accounts.token_program.to_account_info(),
        ],
        &[&admin_seeds],
    )?;

    //========================== initialize token account ==========================
    associated_token::create(CpiContext::new(
        ctx.accounts.associated_token_program.to_account_info(),
        associated_token::Create {
            payer: ctx.accounts.signer.to_account_info(),
            associated_token: ctx.accounts.token_account.to_account_info(),
            authority: ctx.accounts.signer.to_account_info(),
            mint: ctx.accounts.mint.to_account_info(),
            system_program: ctx.accounts.system_program.to_account_info(),
            token_program: ctx.accounts.token_program.to_account_info(),
        },
        ))?;

    //==================mint token and remove authority ==================
    // mint
    invoke_signed(
        &spl_token_2022::instruction::mint_to(
            ctx.accounts.token_program.key,
            ctx.accounts.mint.to_account_info().key,
            ctx.accounts.token_account.to_account_info().key,
            ctx.accounts.signer.to_account_info().key,
            &[ctx.accounts.signer.to_account_info().key],
            1,
        )?,
        &[
            ctx.accounts.mint.to_account_info(),
            ctx.accounts.token_account.to_account_info(),
            ctx.accounts.signer.to_account_info(),
            ctx.accounts.token_program.to_account_info(),
        ],
        &[&admin_seeds],
    )?;

    // remove mint authority
    invoke_signed(
        &spl_token_2022::instruction::set_authority(
            ctx.accounts.token_program.key,
            ctx.accounts.mint.to_account_info().key,
            Option::None,
            AuthorityType::MintTokens,
            ctx.accounts.signer.to_account_info().key,
            &[ctx.accounts.signer.to_account_info().key],
        )?,
        &[
            ctx.accounts.mint.to_account_info(),
            ctx.accounts.signer.to_account_info(),
            ctx.accounts.token_program.to_account_info(),
        ],
        &[&admin_seeds],
    )?;

    Ok(())
}
