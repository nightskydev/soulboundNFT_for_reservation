pub mod error;

pub use crate::error::ProgramErrorCode;
use anchor_lang::{prelude::*, system_program};
use anchor_spl::{
    associated_token::{self, AssociatedToken}, token_2022, token_2022::Burn, token_interface::{spl_token_2022::instruction::AuthorityType, Token2022}
};
use solana_program::program::{invoke, invoke_signed};
use spl_token_2022::{extension::ExtensionType, instruction as token_instruction, state::Mint};
declare_id!("EjZL47GfF2EfNxhwPw1vNGPPVXMDdXBVcu1JCnux5d3L");

#[program]
pub mod mpl_core_anchor_wrapper {

    use super::*;

    pub fn init_admin(
        ctx: Context<InitAdmin>,
        mint_fee: u64,
    ) -> Result<()> {
        ctx.accounts.admin_state.admin = *ctx.accounts.admin.key; // admin wallet address
        ctx.accounts.admin_state.mint_fee = mint_fee; //
        ctx.accounts.admin_state.bump = ctx.bumps.admin_state; // need to store bump for generate seeds

        Ok(())
    }

    pub fn update_admin_info(ctx: Context<UpdateAdminInfo>, mint_fee: u64) -> Result<()> {
        ctx.accounts.admin_state.admin = *ctx.accounts.new_admin.key;
        ctx.accounts.admin_state.mint_fee = mint_fee;
        Ok(())
    }

    pub fn mint_nft(ctx: Context<MintNft>,
        name: String,
        symbol: String,
        uri: String) -> Result<()> {
        msg!("Mint nft with meta data extension and additional meta data");

        let space = ExtensionType::get_account_len::<Mint>(&[
            ExtensionType::NonTransferable, 
            ExtensionType::MetadataPointer]);
        
        // This is the space required for the metadata account. 
        // We put the meta data into the mint account at the end so we 
        // don't need to create and additional account. 
        let meta_data_space = 250;

        let lamports_required = (Rent::get()?).minimum_balance(space + meta_data_space);

        msg!(
            "Create Mint and metadata account size and cost: {} lamports: {}",
            space as u64,
            lamports_required
        );

        system_program::create_account(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                system_program::CreateAccount {
                    from: ctx.accounts.signer.to_account_info(),
                    to: ctx.accounts.mint.to_account_info(),
                },
            ),
            lamports_required,
            space as u64,
            &ctx.accounts.token_program.key(),
        )?;

        // Assign the mint to the token program
        system_program::assign(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                system_program::Assign {
                    account_to_assign: ctx.accounts.mint.to_account_info(),
                },
            ),
            &token_2022::ID,
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
            Err(_) => return err!(ProgramErrorCode::CantInitializeMetadataPointer)
        };

        
        invoke(
            &init_meta_data_pointer_ix,
            &[
                ctx.accounts.mint.to_account_info(),
                ctx.accounts.admin_state.to_account_info()
            ],
        )?;

        // Initialize the Non Transferable Mint Extension
        invoke(
            &token_instruction::initialize_non_transferable_mint(ctx.accounts.token_program.key, ctx.accounts.mint.key)
                .unwrap(),
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
            None).unwrap();
    
        // We use a PDA as a mint authority for the metadata account because 
        // we want to be able to update the NFT from the program.
        let seeds = b"admin_state";
        let bump = ctx.bumps.admin_state;
        let signer: &[&[&[u8]]] = &[&[seeds, &[bump]]];

        msg!("Init metadata {0}", ctx.accounts.admin_state.to_account_info().key);

        // Init the metadata account
        let init_token_meta_data_ix = 
        &spl_token_metadata_interface::instruction::initialize(
            &spl_token_2022::id(),
            ctx.accounts.mint.key,
            ctx.accounts.admin_state.to_account_info().key,
            ctx.accounts.mint.key,
            ctx.accounts.admin_state.to_account_info().key,
            name,
            symbol,
            uri,
        );

        invoke_signed(
            init_token_meta_data_ix,
            &[ctx.accounts.mint.to_account_info().clone(), ctx.accounts.admin_state.to_account_info().clone()],
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
        associated_token::create(
            CpiContext::new(
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
                signer
            ),
            1,
        )?;

        // Freeze the mint authority so no more tokens can be minted to make it an NFT
        token_2022::set_authority(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                token_2022::SetAuthority {
                    current_authority: ctx.accounts.admin_state.to_account_info(),
                    account_or_mint: ctx.accounts.mint.to_account_info(),
                },
                signer
            ),
            AuthorityType::MintTokens,
            None,
        )?;

        // transfer sol
        let transfer_sol_ix = anchor_lang::solana_program::system_instruction::transfer(
            &ctx.accounts.signer.key(),
            &ctx.accounts.admin.key(),
            ctx.accounts.admin_state.mint_fee,
        );
        anchor_lang::solana_program::program::invoke(
            &transfer_sol_ix,
            &[
                ctx.accounts.signer.to_account_info(),
                ctx.accounts.admin.to_account_info(),
            ],
        )?;
        // **ctx
        //     .accounts
        //     .signer
        //     .to_account_info()
        //     .try_borrow_mut_lamports()? -= ctx.accounts.admin_state.mint_fee;
        // **ctx
        //     .accounts
        //     .admin
        //     .to_account_info()
        //     .try_borrow_mut_lamports()? += ctx.accounts.admin_state.mint_fee;

        // store user's info - nft address
        ctx.accounts.user_state.nft_address = ctx.accounts.mint.key();

        Ok(())
    }

    pub fn burn_and_mint_new_nft(ctx: Context<BurnAndMintMewNft>,
        name: String,
        symbol: String,
        uri: String) -> Result<()> {
        msg!("Mint nft with meta data extension and additional meta data");

        let space = ExtensionType::get_account_len::<Mint>(&[
            ExtensionType::NonTransferable, 
            ExtensionType::MetadataPointer]);
        
        // This is the space required for the metadata account. 
        // We put the meta data into the mint account at the end so we 
        // don't need to create and additional account. 
        let meta_data_space = 250;

        let lamports_required = (Rent::get()?).minimum_balance(space + meta_data_space);

        msg!(
            "Create Mint and metadata account size and cost: {} lamports: {}",
            space as u64,
            lamports_required
        );

        system_program::create_account(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                system_program::CreateAccount {
                    from: ctx.accounts.signer.to_account_info(),
                    to: ctx.accounts.mint.to_account_info(),
                },
            ),
            lamports_required,
            space as u64,
            &ctx.accounts.token_program.key(),
        )?;

        // Assign the mint to the token program
        system_program::assign(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                system_program::Assign {
                    account_to_assign: ctx.accounts.mint.to_account_info(),
                },
            ),
            &token_2022::ID,
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
            Err(_) => return err!(ProgramErrorCode::CantInitializeMetadataPointer)
        };

        
        invoke(
            &init_meta_data_pointer_ix,
            &[
                ctx.accounts.mint.to_account_info(),
                ctx.accounts.admin_state.to_account_info()
            ],
        )?;

        // Initialize the Non Transferable Mint Extension
        invoke(
            &token_instruction::initialize_non_transferable_mint(ctx.accounts.token_program.key, ctx.accounts.mint.key)
                .unwrap(),
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
            None).unwrap();
    
        // We use a PDA as a mint authority for the metadata account because 
        // we want to be able to update the NFT from the program.
        let seeds = b"admin_state";
        let bump = ctx.bumps.admin_state;
        let signer: &[&[&[u8]]] = &[&[seeds, &[bump]]];

        msg!("Init metadata {0}", ctx.accounts.admin_state.to_account_info().key);

        // Init the metadata account
        let init_token_meta_data_ix = 
        &spl_token_metadata_interface::instruction::initialize(
            &spl_token_2022::id(),
            ctx.accounts.mint.key,
            ctx.accounts.admin_state.to_account_info().key,
            ctx.accounts.mint.key,
            ctx.accounts.admin_state.to_account_info().key,
            name,
            symbol,
            uri,
        );

        invoke_signed(
            init_token_meta_data_ix,
            &[ctx.accounts.mint.to_account_info().clone(), ctx.accounts.admin_state.to_account_info().clone()],
            signer,
        )?;
  
        // Create the associated token account
        associated_token::create(
            CpiContext::new(
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
                signer
            ),
            1,
        )?;

        // Freeze the mint authority so no more tokens can be minted to make it an NFT
        token_2022::set_authority(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                token_2022::SetAuthority {
                    current_authority: ctx.accounts.admin_state.to_account_info(),
                    account_or_mint: ctx.accounts.mint.to_account_info(),
                },
                signer
            ),
            AuthorityType::MintTokens,
            None,
        )?;

        // transfer sol
        let transfer_sol_ix = anchor_lang::solana_program::system_instruction::transfer(
            &ctx.accounts.signer.key(),
            &ctx.accounts.admin.key(),
            ctx.accounts.admin_state.mint_fee,
        );
        anchor_lang::solana_program::program::invoke(
            &transfer_sol_ix,
            &[
                ctx.accounts.signer.to_account_info(),
                ctx.accounts.admin.to_account_info(),
            ],
        )?;

        // burn old token
        token_2022::burn(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Burn {
                    mint: ctx.accounts.old_mint.to_account_info(),
                    from: ctx.accounts.old_token_account.to_account_info(),
                    authority: ctx.accounts.signer.to_account_info(),
                },
            ),
            1,
        )?;

        // store user's info - nft address
        ctx.accounts.user_state.nft_address = ctx.accounts.mint.key();

        Ok(())
    }
}

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

#[derive(Accounts)]
// #[instruction(name: String, symbol: String, uri: String)]
pub struct BurnAndMintMewNft<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token2022>,
    /// CHECK: We will create this one for the user
    #[account(mut)]
    pub old_token_account: AccountInfo<'info>,
    /// CHECK: We will create this one for the user
    #[account(mut)]
    pub old_mint: AccountInfo<'info>,
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

#[derive(Accounts)]
pub struct InitAdmin<'info> {
    /// CHECK: This is not dangerous because we don't read or write from this account
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
         init,
         seeds = [b"admin_state".as_ref()],
         bump,
         payer = admin,
         space = AdminState::space()
     )]
    pub admin_state: Box<Account<'info, AdminState>>,

    /// CHECK: This is not dangerous because we don't read or write from this account
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct UpdateAdminInfo<'info> {
    /// CHECK: This is not dangerous because we don't read or write from this account
    #[account(mut)]
    pub admin: Signer<'info>,

     /// CHECK: This is not dangerous because we don't read or write from this account
     #[account(mut)]
     pub new_admin: AccountInfo<'info>,

    #[account(
        mut,
        seeds = [b"admin_state".as_ref()],
        bump,
        constraint = admin_state.admin == admin.key()
     )]
    pub admin_state: Box<Account<'info, AdminState>>,
}

#[account]
pub struct AdminState {
    pub bump: u8, // 1
    pub admin: Pubkey,
    pub mint_fee: u64,
}

impl AdminState {
    pub fn space() -> usize {
        8 + 1 + 32 + 8
    }

    // pub fn seeds(&self) -> [&[u8]; 2] {
    //     [
    //         b"admin_state"[..].as_ref(),
    //         self.bump.as_ref(),
    //     ]
    // }
}

#[account]
pub struct UserState {
    pub nft_address: Pubkey,
}

impl UserState {
    pub fn space() -> usize {
        8 + 32
    }
}
