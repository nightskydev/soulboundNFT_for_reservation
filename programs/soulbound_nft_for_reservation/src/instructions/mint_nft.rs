use anchor_lang::prelude::*;
use anchor_spl::token_2022::spl_token_2022::extension::{
    BaseStateWithExtensions, StateWithExtensions,
};
use anchor_spl::token_2022::spl_token_2022::{self, extension::ExtensionType};
use anchor_spl::token_2022_extensions::spl_token_metadata_interface;
use anchor_spl::{
    associated_token::{self, AssociatedToken},
    token_2022,
    token_interface::{spl_token_2022::instruction::AuthorityType, Token2022, TokenInterface, Mint, TokenAccount, transfer_checked, TransferChecked},
};
use solana_program::program::{invoke, invoke_signed};

use crate::error::ProgramErrorCode;
use crate::state::*;
use crate::utils::safe_create_account;

#[derive(Accounts)]
// #[instruction(name: String, symbol: String, uri: String)]
pub struct MintNft<'info> {
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
        mut,
        seeds = [b"admin_state".as_ref()],
        bump,
        constraint = admin_state.admin == admin.key()
    )]
    pub admin_state: Account<'info, AdminState>,
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

    // === Payment token accounts ===
    /// The SPL token mint for payment (e.g., USDC) - must match admin_state.payment_mint
    #[account(
        constraint = payment_mint.key() == admin_state.payment_mint @ ProgramErrorCode::InvalidPaymentMint
    )]
    pub payment_mint: InterfaceAccount<'info, Mint>,

    /// Payer's token account for payment
    #[account(
        mut,
        constraint = payer_token_account.mint == payment_mint.key() @ ProgramErrorCode::InvalidPaymentTokenAccount,
        constraint = payer_token_account.owner == signer.key() @ ProgramErrorCode::InvalidPaymentTokenAccount
    )]
    pub payer_token_account: InterfaceAccount<'info, TokenAccount>,

    /// Vault token account (PDA-controlled) to receive payment - created in init_admin
    #[account(
        mut,
        seeds = [b"vault", payment_mint.key().as_ref()],
        bump,
        token::mint = payment_mint,
        token::authority = admin_state,
        token::token_program = payment_token_program,
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,

    /// Token program for payment (can be Token or Token2022)
    pub payment_token_program: Interface<'info, TokenInterface>,
}

pub fn handler(ctx: Context<MintNft>, name: String, symbol: String, uri: String) -> Result<()> {
    msg!("Mint nft with meta data extension and additional meta data");

    // Validate that user doesn't already have an NFT
    require!(
        ctx.accounts.user_state.nft_address == Pubkey::default(),
        ProgramErrorCode::UserAlreadyHasNft
    );

    // Check max supply (0 = unlimited)
    let max_supply = ctx.accounts.admin_state.max_supply;
    if max_supply > 0 {
        require!(
            ctx.accounts.admin_state.current_reserved_count < max_supply,
            ProgramErrorCode::MaxSupplyReached
        );
    }

    let space = ExtensionType::try_calculate_account_len::<spl_token_2022::state::Mint>(&[
        ExtensionType::MintCloseAuthority,
        ExtensionType::NonTransferable,
        ExtensionType::MetadataPointer,
    ])?;

    // This is the space required for the metadata account.
    // We put the meta data into the mint account at the end so we
    // don't need to create and additional account.

    let lamports = Rent::get()?.minimum_balance(space);

    msg!(
        "Create Mint and metadata account size and cost: {} lamports: {}",
        space as u64,
        lamports
    );

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
    // authority: admin_state account (PDA)
    invoke(
        &spl_token_2022::instruction::initialize_mint_close_authority(
            ctx.accounts.token_program.key,
            ctx.accounts.mint.key,
            Some(&ctx.accounts.admin_state.key()),
        )?,
        &[
            ctx.accounts.mint.to_account_info(),
            ctx.accounts.admin_state.to_account_info(),
            ctx.accounts.token_program.to_account_info(),
        ],
    )?;

    // Initialize the metadata pointer (Need to do this before initializing the mint)
    let init_meta_data_pointer_ix =
        match spl_token_2022::extension::metadata_pointer::instruction::initialize(
            &Token2022::id(),
            &ctx.accounts.mint.key(),
            Some(ctx.accounts.admin_state.key()),
            Some(ctx.accounts.mint.key()),
        ) {
            Ok(ix) => ix,
            Err(_) => {
                cleanup_new_mint(&ctx)?;
                return err!(ProgramErrorCode::CantInitializeMetadataPointer);
            }
        };

    invoke(
        &init_meta_data_pointer_ix,
        &[
            ctx.accounts.mint.to_account_info(),
            ctx.accounts.admin_state.to_account_info(),
        ],
    )?;

    // Initialize the Non Transferable Mint Extension
    invoke(
        &spl_token_2022::instruction::initialize_non_transferable_mint(
            ctx.accounts.token_program.key,
            ctx.accounts.mint.key,
        )?,
        &[
            ctx.accounts.mint.to_account_info(),
            ctx.accounts.token_program.to_account_info(),
            ctx.accounts.system_program.to_account_info(),
        ],
    )?;

    // Initialize the mint cpi
    let mint_cpi_ix = CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        token_2022::InitializeMint2 {
            mint: ctx.accounts.mint.to_account_info(),
        },
    );

    token_2022::initialize_mint2(
        mint_cpi_ix,
        0,
        &ctx.accounts.admin_state.key(),
        Some(&ctx.accounts.admin_state.key()),
    )?;

    // We use a PDA as a mint authority for the metadata account because
    // we want to be able to update the NFT from the program.
    let seeds = b"admin_state";
    let bump = ctx.bumps.admin_state;
    let signer: &[&[&[u8]]] = &[&[seeds, &[bump]]];

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

    msg!(
        "Init metadata {0}",
        ctx.accounts.admin_state.to_account_info().key
    );

    // transfer additional rent
    invoke(
        &anchor_lang::solana_program::system_instruction::transfer(
            ctx.accounts.signer.key,
            ctx.accounts.mint.key,
            additional_rent,
        ),
        &[
            ctx.accounts.signer.to_account_info(),
            ctx.accounts.mint.to_account_info(),
            ctx.accounts.system_program.to_account_info(),
        ],
    )?;

    // initialize TokenMetadata extension
    // update authority: WP_NFT_UPDATE_AUTH
    invoke_signed(
        &spl_token_metadata_interface::instruction::initialize(
            ctx.accounts.token_program.key,
            ctx.accounts.mint.key,
            ctx.accounts.admin_state.to_account_info().key,
            ctx.accounts.mint.key,
            &ctx.accounts.admin_state.to_account_info().key(),
            metadata.name,
            metadata.symbol,
            metadata.uri,
        ),
        &[
            ctx.accounts.mint.to_account_info(),
            ctx.accounts.admin_state.to_account_info(),
            ctx.accounts.admin_state.to_account_info(),
            ctx.accounts.token_program.to_account_info(),
        ],
        signer,
    )?;

    // Update the metadata account with an additional metadata field in this case the player level
    // invoke_signed(
    //     &spl_token_metadata_interface::instruction::update_field(
    //         &spl_token_2022::id(),
    //         ctx.accounts.mint.key,
    //         ctx.accounts.admin_state.to_account_info().key,
    //         spl_token_metadata_interface::state::Field::Key("level".to_string()),
    //         "1".to_string(),
    //     ),
    //     &[
    //         ctx.accounts.mint.to_account_info().clone(),
    //         ctx.accounts.admin_state.to_account_info().clone(),
    //     ],
    //     signer
    // )?;

    // Create the associated token account
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

    // Mint one token to the associated token account of the player
    token_2022::mint_to(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            token_2022::MintTo {
                mint: ctx.accounts.mint.to_account_info(),
                to: ctx.accounts.token_account.to_account_info(),
                authority: ctx.accounts.admin_state.to_account_info(),
            },
            signer,
        ),
        1,
    )?;

    // remove mint authority
    invoke_signed(
        &spl_token_2022::instruction::set_authority(
            ctx.accounts.token_program.key,
            ctx.accounts.mint.to_account_info().key,
            Option::None,
            AuthorityType::MintTokens,
            ctx.accounts.admin_state.to_account_info().key,
            &[ctx.accounts.admin_state.to_account_info().key],
        )?,
        &[
            ctx.accounts.mint.to_account_info(),
            ctx.accounts.admin_state.to_account_info(),
            ctx.accounts.token_program.to_account_info(),
        ],
        signer,
    )?;

    // Transfer payment tokens (e.g., USDC) from payer to vault
    transfer_checked(
        CpiContext::new(
            ctx.accounts.payment_token_program.to_account_info(),
            TransferChecked {
                from: ctx.accounts.payer_token_account.to_account_info(),
                mint: ctx.accounts.payment_mint.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
                authority: ctx.accounts.signer.to_account_info(),
            },
        ),
        ctx.accounts.admin_state.mint_fee,
        ctx.accounts.payment_mint.decimals,
    )?;

    // store user's info - nft address
    ctx.accounts.user_state.nft_address = ctx.accounts.mint.key();

    ctx.accounts.admin_state.current_reserved_count += 1; // increment reserved count
    msg!(
        "Current reserved count: {}",
        ctx.accounts.admin_state.current_reserved_count
    );

    Ok(())
}

fn cleanup_new_mint(ctx: &Context<MintNft>) -> Result<()> {
    let seeds = b"admin_state";
    let bump = ctx.bumps.admin_state;
    let signer: &[&[&[u8]]] = &[&[seeds, &[bump]]];

    invoke_signed(
        &spl_token_2022::instruction::close_account(
            ctx.accounts.token_program.key,
            ctx.accounts.mint.key,
            ctx.accounts.signer.key,          // lamports go back to user
            &ctx.accounts.admin_state.key(),  // close authority
            &[],
        )?,
        &[
            ctx.accounts.token_program.to_account_info(),
            ctx.accounts.mint.to_account_info(),
            ctx.accounts.signer.to_account_info(),
            ctx.accounts.admin_state.to_account_info(),
        ],
        signer,
    )?;

    Ok(())
}