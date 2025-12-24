use anchor_lang::prelude::*;
use anchor_spl::token_2022::spl_token_2022::extension::{
    BaseStateWithExtensions, StateWithExtensions,
};
use anchor_spl::token_2022::spl_token_2022::{self, extension::ExtensionType};
use anchor_spl::token_2022_extensions::spl_token_metadata_interface;
use anchor_spl::{
    token_2022,
    token_2022::Token2022,
};
use solana_program::program::{invoke, invoke_signed};

use crate::error::ProgramErrorCode;
use crate::state::*;
use crate::utils::safe_create_account;

// Event definition
#[event]
pub struct CreateCollectionEvent {
    pub collection_mint: Pubkey,
    pub name: String,
    pub symbol: String,
    pub uri: String,
    pub timestamp: i64,
}

#[derive(Accounts)]
pub struct CreateCollectionNft<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token2022>,
    #[account(mut)]
    pub collection_mint: Signer<'info>,

    /// CHECK: The collection state PDA to track collection info
    #[account(
        init,
        seeds = [b"collection".as_ref(), collection_mint.key().as_ref()],
        bump,
        payer = signer,
        space = CollectionState::space()
    )]
    pub collection_state: Box<Account<'info, CollectionState>>,

    #[account(
        mut,
        seeds = [b"admin_state".as_ref()],
        bump,
    )]
    pub admin_state: Box<Account<'info, AdminState>>,
}

pub fn handler(ctx: Context<CreateCollectionNft>, name: String, symbol: String, uri: String) -> Result<()> {
    msg!("Create collection NFT");

    let space = ExtensionType::try_calculate_account_len::<spl_token_2022::state::Mint>(&[
        ExtensionType::MintCloseAuthority,
        ExtensionType::MetadataPointer,
    ])?;

    let lamports = Rent::get()?.minimum_balance(space);

    msg!(
        "Create Collection Mint and metadata account size and cost: {} lamports: {}",
        space as u64,
        lamports
    );

    // create collection mint account
    safe_create_account(
        ctx.accounts.system_program.to_account_info(),
        ctx.accounts.signer.to_account_info(),
        ctx.accounts.collection_mint.to_account_info(),
        &ctx.accounts.token_program.key(),
        lamports,
        space as u64,
        &[],
    )?;

    // initialize MintCloseAuthority extension
    invoke(
        &spl_token_2022::instruction::initialize_mint_close_authority(
            ctx.accounts.token_program.key,
            ctx.accounts.collection_mint.key,
            Some(&ctx.accounts.admin_state.key()),
        )?,
        &[
            ctx.accounts.collection_mint.to_account_info(),
            ctx.accounts.admin_state.to_account_info(),
            ctx.accounts.token_program.to_account_info(),
        ],
    )?;

    // Initialize the metadata pointer
    let init_meta_data_pointer_ix =
        match spl_token_2022::extension::metadata_pointer::instruction::initialize(
            &Token2022::id(),
            &ctx.accounts.collection_mint.key(),
            Some(ctx.accounts.admin_state.key()),
            Some(ctx.accounts.collection_mint.key()),
        ) {
            Ok(ix) => ix,
            Err(_) => {
                cleanup_collection_mint(&ctx)?;
                return err!(ProgramErrorCode::CantInitializeMetadataPointer);
            }
        };

    invoke(
        &init_meta_data_pointer_ix,
        &[
            ctx.accounts.collection_mint.to_account_info(),
            ctx.accounts.admin_state.to_account_info(),
        ],
    )?;

    // Initialize the mint
    let mint_cpi_ix = CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        token_2022::InitializeMint2 {
            mint: ctx.accounts.collection_mint.to_account_info(),
        },
    );

    token_2022::initialize_mint2(
        mint_cpi_ix,
        0,
        &ctx.accounts.admin_state.key(),
        Some(&ctx.accounts.admin_state.key()),
    )?;

    // We use a PDA as a mint authority for the metadata account
    let seeds = b"admin_state";
    let bump = ctx.bumps.admin_state;
    let signer: &[&[&[u8]]] = &[&[seeds, &[bump]]];

    let metadata = spl_token_metadata_interface::state::TokenMetadata {
        name: name.clone(),
        symbol: symbol.clone(),
        uri: uri.clone(),
        ..Default::default()
    };

    // we need to add rent for TokenMetadata extension to reallocate space
    let token_mint_data = ctx.accounts.collection_mint.try_borrow_data()?;
    let token_mint_unpacked =
        StateWithExtensions::<spl_token_2022::state::Mint>::unpack(&token_mint_data)?;
    let new_account_len = token_mint_unpacked
        .try_get_new_account_len_for_variable_len_extension::<spl_token_metadata_interface::state::TokenMetadata>(&metadata)?;

    let new_rent_exempt_minimum = Rent::get()?.minimum_balance(new_account_len);
    let additional_rent = new_rent_exempt_minimum.saturating_sub(ctx.accounts.collection_mint.lamports());
    drop(token_mint_data); // CPI call will borrow the account data

    msg!(
        "Init collection metadata {0}",
        ctx.accounts.admin_state.to_account_info().key
    );

    // transfer additional rent
    invoke(
        &anchor_lang::solana_program::system_instruction::transfer(
            ctx.accounts.signer.key,
            ctx.accounts.collection_mint.key,
            additional_rent,
        ),
        &[
            ctx.accounts.signer.to_account_info(),
            ctx.accounts.collection_mint.to_account_info(),
            ctx.accounts.system_program.to_account_info(),
        ],
    )?;

    // initialize TokenMetadata extension
    invoke_signed(
        &spl_token_metadata_interface::instruction::initialize(
            ctx.accounts.token_program.key,
            ctx.accounts.collection_mint.key,
            ctx.accounts.admin_state.to_account_info().key,
            ctx.accounts.collection_mint.key,
            &ctx.accounts.admin_state.to_account_info().key(),
            metadata.name,
            metadata.symbol,
            metadata.uri,
        ),
        &[
            ctx.accounts.collection_mint.to_account_info(),
            ctx.accounts.admin_state.to_account_info(),
            ctx.accounts.admin_state.to_account_info(),
            ctx.accounts.token_program.to_account_info(),
        ],
        signer,
    )?;


    // Store collection info
    let clock = Clock::get()?;
    ctx.accounts.collection_state.collection_mint = ctx.accounts.collection_mint.key();
    ctx.accounts.collection_state.name = name.clone();
    ctx.accounts.collection_state.symbol = symbol.clone();
    ctx.accounts.collection_state.uri = uri.clone();
    ctx.accounts.collection_state.created_at = clock.unix_timestamp;
    ctx.accounts.collection_state.is_verified = true; // Collection is self-verified

    // Emit event
    emit!(CreateCollectionEvent {
        collection_mint: ctx.accounts.collection_mint.key(),
        name,
        symbol,
        uri,
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}

fn cleanup_collection_mint(ctx: &Context<CreateCollectionNft>) -> Result<()> {
    let seeds = b"admin_state";
    let bump = ctx.bumps.admin_state;
    let signer: &[&[&[u8]]] = &[&[seeds, &[bump]]];

    invoke_signed(
        &spl_token_2022::instruction::close_account(
            ctx.accounts.token_program.key,
            ctx.accounts.collection_mint.key,
            ctx.accounts.signer.key,          // lamports go back to user
            &ctx.accounts.admin_state.key(),  // close authority
            &[],
        )?,
        &[
            ctx.accounts.token_program.to_account_info(),
            ctx.accounts.collection_mint.to_account_info(),
            ctx.accounts.signer.to_account_info(),
            ctx.accounts.admin_state.to_account_info(),
        ],
        signer,
    )?;

    Ok(())
}
