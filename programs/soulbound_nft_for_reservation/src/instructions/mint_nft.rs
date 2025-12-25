use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::{self, AssociatedToken},
    token::{self, Token, Mint, transfer_checked, TransferChecked},
    token_interface::{TokenInterface, Mint as InterfaceMint, TokenAccount as InterfaceTokenAccount},
};
use mpl_token_metadata::{
    instructions::{CreateMetadataAccountV3, CreateMetadataAccountV3InstructionArgs},
    types::{DataV2, Creator},
};
use solana_program::program::invoke_signed;

use crate::error::ProgramErrorCode;
use crate::state::*;

// Event definition
#[event]
pub struct MintNftEvent {
    pub user: Pubkey,
    pub mint_address: Pubkey,
    pub timestamp: i64,
}

#[derive(Accounts)]
// #[instruction(name: String, symbol: String, uri: String)]
pub struct MintNft<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    /// CHECK: We will create this one for the user
    #[account(mut)]
    pub token_account: AccountInfo<'info>,
    #[account(
        init,
        payer = signer,
        mint::decimals = 0,
        mint::authority = admin_state,
        mint::freeze_authority = admin_state,
    )]
    pub mint: Account<'info, Mint>,
    pub rent: Sysvar<'info, Rent>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    /// CHECK: Metaplex Token Metadata program
    pub token_metadata_program: AccountInfo<'info>,
    /// CHECK: Metadata account for the NFT - derived from mint
    #[account(
        mut,
        seeds = [b"metadata", token_metadata_program.key().as_ref(), mint.key().as_ref()],
        bump,
        seeds::program = token_metadata_program.key(),
    )]
    pub metadata_account: AccountInfo<'info>,
    #[account(
        mut,
        seeds = [b"admin_state".as_ref()],
        bump,
    )]
    pub admin_state: Box<Account<'info, AdminState>>,
    #[account(
        init_if_needed,
        seeds = [b"user_state".as_ref(), signer.key().as_ref()],
        bump,
        payer = signer,
        space = UserState::space()
    )]
    pub user_state: Box<Account<'info, UserState>>,

    // === Payment token accounts ===
    /// The SPL token mint for payment (e.g., USDC) - must match admin_state.payment_mint
    #[account(
        constraint = payment_mint.key() == admin_state.payment_mint @ ProgramErrorCode::InvalidPaymentMint
    )]
    pub payment_mint: InterfaceAccount<'info, InterfaceMint>,

    /// Payer's token account for payment
    #[account(
        mut,
        constraint = payer_token_account.mint == payment_mint.key() @ ProgramErrorCode::InvalidPaymentTokenAccount,
        constraint = payer_token_account.owner == signer.key() @ ProgramErrorCode::InvalidPaymentTokenAccount
    )]
    pub payer_token_account: InterfaceAccount<'info, InterfaceTokenAccount>,

    /// Vault token account (PDA-controlled) to receive payment - created in init_admin
    #[account(
        mut,
        seeds = [b"vault", payment_mint.key().as_ref()],
        bump,
        token::mint = payment_mint,
        token::authority = admin_state,
        token::token_program = payment_token_program,
    )]
    pub vault: InterfaceAccount<'info, InterfaceTokenAccount>,

    /// Token program for payment (can be Token or Token2022)
    pub payment_token_program: Interface<'info, TokenInterface>,

    // === Optional Collection ===
    /// CHECK: Optional collection mint account for grouping NFTs
    pub collection_mint: Option<AccountInfo<'info>>,
}

pub fn handler(ctx: Context<MintNft>, name: String, symbol: String, uri: String) -> Result<()> {
    msg!("Mint regular NFT with Metaplex metadata");

    // Check mint start date (0 = no restriction)
    let mint_start_date = ctx.accounts.admin_state.mint_start_date;
    if mint_start_date > 0 {
        let clock = Clock::get()?;
        require!(
            clock.unix_timestamp >= mint_start_date,
            ProgramErrorCode::MintNotStarted
        );
    }

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

    // Mint is already initialized by the init constraint above

    // Create metadata for the NFT
    let seeds = b"admin_state";
    let bump = ctx.bumps.admin_state;
    let signer: &[&[&[u8]]] = &[&[seeds, &[bump]]];

    // Create additional metadata based on collection type
    let _additional_metadata = if let Some(collection_mint) = &ctx.accounts.collection_mint {
        let collection_key = collection_mint.key().to_string();
        match collection_key.as_str() {
            // OG Collection - add consumption tracking and utility info
            _ if collection_key == ctx.accounts.admin_state.og_collection.to_string() => {
                format!("{{\"collection\":\"{}\",\"nft_type\":\"og\",\"consumed\":\"false\",\"discount_tier\":\"standard\",\"profit_sharing_eligible\":\"true\"}}", collection_key)
            },
            // Dongle Proof Collection - add purchase details
            _ if collection_key == ctx.accounts.admin_state.dongle_proof_collection.to_string() => {
                let timestamp = Clock::get()?.unix_timestamp;
                format!("{{\"collection\":\"{}\",\"nft_type\":\"dongle_proof\",\"purchase_date\":\"{}\",\"dongle_specs\":\"{{}}\"}}", collection_key, timestamp)
            },
            // Generic collection
            _ => {
                format!("{{\"collection\":\"{}\",\"nft_type\":\"generic\"}}", collection_key)
            }
        }
    } else {
        "{}".to_string()
    };

    // Create the metadata account using Metaplex
    let create_metadata_ix = CreateMetadataAccountV3 {
        metadata: ctx.accounts.metadata_account.key(),
        mint: ctx.accounts.mint.key(),
        mint_authority: ctx.accounts.admin_state.key(),
        update_authority: (ctx.accounts.admin_state.key(), true),
        payer: ctx.accounts.signer.key(),
        system_program: ctx.accounts.system_program.key(),
        rent: Some(ctx.accounts.rent.key()),
    };

    let data = DataV2 {
        name,
        symbol,
        uri,
        seller_fee_basis_points: 0, // No royalties for these NFTs
        creators: Some(vec![Creator {
            address: ctx.accounts.admin_state.key(),
            verified: false, // We'll verify this
            share: 100,
        }]),
        collection: ctx.accounts.collection_mint.as_ref().map(|mint| mpl_token_metadata::types::Collection {
            verified: false,
            key: mint.key(),
        }),
        uses: None,
    };

    let args = CreateMetadataAccountV3InstructionArgs {
        data,
        is_mutable: true, // Allow updates
        collection_details: None,
    };

    let ix = create_metadata_ix.instruction(args);

    invoke_signed(
        &ix,
        &[
            ctx.accounts.metadata_account.to_account_info(),
            ctx.accounts.mint.to_account_info(),
            ctx.accounts.admin_state.to_account_info(),
            ctx.accounts.signer.to_account_info(),
            ctx.accounts.system_program.to_account_info(),
            ctx.accounts.rent.to_account_info(),
        ],
        signer,
    )?;

    // Note: For regular Metaplex NFTs, metadata updates would be done through the Metaplex program
    // not through the token program directly

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

    // Mint one token to the associated token account
    token::mint_to(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            token::MintTo {
                mint: ctx.accounts.mint.to_account_info(),
                to: ctx.accounts.token_account.to_account_info(),
                authority: ctx.accounts.admin_state.to_account_info(),
            },
            signer,
        ),
        1,
    )?;

    // Remove mint authority to make it immutable (typical for NFTs)
    // TODO: Fix AuthorityType import conflict and re-enable
    // token::set_authority(
    //     CpiContext::new_with_signer(
    //         ctx.accounts.token_program.to_account_info(),
    //         token::SetAuthority {
    //             current_authority: ctx.accounts.admin_state.to_account_info(),
    //             account_or_mint: ctx.accounts.mint.to_account_info(),
    //         },
    //         signer,
    //     ),
    //     AuthorityType::MintTokens,
    //     None,
    // )?;

    // Runtime validation: ensure mint fee is valid (defense in depth)
    require!(
        ctx.accounts.admin_state.mint_fee > 0,
        ProgramErrorCode::InvalidMintFee
    );

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

    // store user's info - nft address and mint date
    let clock = Clock::get()?;
    ctx.accounts.user_state.nft_address = ctx.accounts.mint.key();
    ctx.accounts.user_state.nft_mint_date = clock.unix_timestamp;

    ctx.accounts.admin_state.current_reserved_count = ctx.accounts.admin_state
        .current_reserved_count
        .checked_add(1)
        .ok_or(ProgramErrorCode::ReservedCountOverflow)?;
    msg!(
        "Current reserved count: {}",
        ctx.accounts.admin_state.current_reserved_count
    );

    // Emit event for reliable filtering
    emit!(MintNftEvent {
        user: ctx.accounts.signer.key(),
        mint_address: ctx.accounts.mint.key(),
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}
