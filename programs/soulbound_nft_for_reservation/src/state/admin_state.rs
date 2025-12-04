use anchor_lang::prelude::*;

#[account]
pub struct AdminState {
    pub bump: u8, // bump for PDA
    pub super_admin: Pubkey, // super admin - can set vice_admins but CANNOT update withdraw_wallet alone
    pub vice_admins: [Pubkey; 4], // 4 vice admin wallets for multisig
    pub withdraw_wallet: Pubkey, // wallet address to receive withdrawn funds
    pub mint_fee: u64, // fee to mint nft - in smallest token units
    pub current_reserved_count: u64, // current number of reserved NFTs
    pub payment_mint: Pubkey, // SPL token mint address for payment (e.g., USDC)
    pub max_supply: u64, // maximum number of NFTs that can be minted (0 = unlimited)
    pub mint_start_date: i64, // Unix timestamp when minting starts (0 = no restriction)
    
    // Multisig fields for withdraw wallet update
    pub pending_withdraw_wallet: Pubkey, // proposed new withdraw wallet (zero = no pending proposal)
    pub approval_bitmap: u8, // bit 0 = super_admin, bits 1-4 = vice_admins[0-3]
    
    // Dongle pricing
    pub dongle_price_nft_holder: u64, // dongle price for soulbound NFT holders (e.g., 100 USDC)
    pub dongle_price_normal: u64, // dongle price for normal users without NFT (e.g., 499 USDC)
    pub purchase_started: bool, // flag to enable/disable dongle purchases
    
    // Multisig fields for admin wallet update (super_admin + vice_admins)
    pub pending_admin_wallets: [Pubkey; 5], // proposed new admin wallets [0]=super_admin, [1-4]=vice_admins
    pub admin_approval_bitmap: u8, // approvals for admin wallet proposal
}

impl AdminState {
    pub const REQUIRED_APPROVALS: u8 = 3; // 3 of 5 required

    pub fn space() -> usize {
        8 +         // discriminator
        1 +         // bump
        32 +        // super_admin
        (32 * 4) +  // vice_admins [4 pubkeys]
        32 +        // withdraw_wallet
        8 +         // mint_fee
        8 +         // current_reserved_count
        32 +        // payment_mint
        8 +         // max_supply
        8 +         // mint_start_date
        32 +        // pending_withdraw_wallet
        1 +         // approval_bitmap
        8 +         // dongle_price_nft_holder
        8 +         // dongle_price_normal
        1 +         // purchase_started
        (32 * 5) +  // pending_admin_wallets [5 pubkeys]
        1           // admin_approval_bitmap
    }

    /// Check if a signer is part of the multisig (super_admin or vice_admin)
    pub fn get_signer_index(&self, signer: &Pubkey) -> Option<u8> {
        if *signer == self.super_admin {
            return Some(0);
        }
        for (i, vice_admin) in self.vice_admins.iter().enumerate() {
            if *signer == *vice_admin && *vice_admin != Pubkey::default() {
                return Some((i + 1) as u8);
            }
        }
        None
    }

    // ========== Withdraw Wallet Proposal Methods ==========
    
    /// Check if signer has already approved withdraw wallet proposal
    pub fn has_approved(&self, signer_index: u8) -> bool {
        (self.approval_bitmap >> signer_index) & 1 == 1
    }

    /// Add approval for withdraw wallet proposal
    pub fn add_approval(&mut self, signer_index: u8) {
        self.approval_bitmap |= 1 << signer_index;
    }

    /// Count total approvals for withdraw wallet proposal
    pub fn approval_count(&self) -> u8 {
        self.approval_bitmap.count_ones() as u8
    }

    /// Reset pending withdraw wallet proposal
    pub fn reset_proposal(&mut self) {
        self.pending_withdraw_wallet = Pubkey::default();
        self.approval_bitmap = 0;
    }

    // ========== Admin Wallet Proposal Methods ==========
    
    /// Check if signer has already approved admin wallet proposal
    pub fn has_admin_approved(&self, signer_index: u8) -> bool {
        (self.admin_approval_bitmap >> signer_index) & 1 == 1
    }

    /// Add approval for admin wallet proposal
    pub fn add_admin_approval(&mut self, signer_index: u8) {
        self.admin_approval_bitmap |= 1 << signer_index;
    }

    /// Count total approvals for admin wallet proposal
    pub fn admin_approval_count(&self) -> u8 {
        self.admin_approval_bitmap.count_ones() as u8
    }

    /// Check if there's a pending admin wallet proposal
    pub fn has_pending_admin_proposal(&self) -> bool {
        // Check if any of the pending admin wallets is non-default
        self.pending_admin_wallets.iter().any(|p| *p != Pubkey::default())
    }

    /// Reset pending admin wallet proposal
    pub fn reset_admin_proposal(&mut self) {
        self.pending_admin_wallets = [Pubkey::default(); 5];
        self.admin_approval_bitmap = 0;
    }

    /// Apply approved admin wallets
    pub fn apply_admin_wallets(&mut self) {
        self.super_admin = self.pending_admin_wallets[0];
        self.vice_admins = [
            self.pending_admin_wallets[1],
            self.pending_admin_wallets[2],
            self.pending_admin_wallets[3],
            self.pending_admin_wallets[4],
        ];
        self.reset_admin_proposal();
        // Also reset any pending withdraw wallet proposal since admins changed
        self.reset_proposal();
    }
}
