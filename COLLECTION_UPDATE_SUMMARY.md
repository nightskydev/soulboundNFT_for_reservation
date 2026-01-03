# Collection Update Summary

## Overview
Updated the smart contract to support **3 different NFT collections** instead of just one:
- **OG Collection** (og_collection)
- **Regular Collection** (regular_collection)  
- **Basic Collection** (basic_collection)

## Key Changes

### 1. AdminState Structure (`admin_state.rs`)
**Previous Structure:**
- Single `mint_fee`, `max_supply`, and `current_reserved_count` for all NFTs
- Single `og_collection` field (Pubkey)

**New Structure:**
- Added `CollectionType` enum with variants: `OG`, `Regular`, `Basic`
- Added `CollectionConfig` struct containing:
  - `collection_mint: Pubkey`
  - `mint_fee: u64`
  - `max_supply: u64`
  - `current_reserved_count: u64`
- Three collection configs: `og_collection`, `regular_collection`, `basic_collection`
- **Shared fields** (same for all collections):
  - `payment_mint: Pubkey` - payment token used for all collections
  - `mint_start_date: i64` - minting start time for all collections

### 2. Initialize Admin (`init_admin`)
**New Parameters:**
```rust
pub fn init_admin(
    ctx: Context<InitAdmin>,
    // OG Collection parameters
    og_collection_mint: Pubkey,
    og_mint_fee: u64,
    og_max_supply: u64,
    // Regular Collection parameters
    regular_collection_mint: Pubkey,
    regular_mint_fee: u64,
    regular_max_supply: u64,
    // Basic Collection parameters
    basic_collection_mint: Pubkey,
    basic_mint_fee: u64,
    basic_max_supply: u64,
    // Shared parameters
    withdraw_wallet: Pubkey,
    mint_start_date: i64,
) -> Result<()>
```

### 3. Mint NFT (`mint_nft`)
**New Signature:**
```rust
pub fn mint_nft(
    ctx: Context<MintNft>,
    collection_type: CollectionType,  // NEW: Specify which collection to mint
    name: String,
    symbol: String,
    uri: String
) -> Result<()>
```

**Behavior:**
- Validates collection type matches the provided collection mint
- Uses the specific collection's `mint_fee` and `max_supply`
- Increments the specific collection's `current_reserved_count`
- Validates against the collection's max supply limit

### 4. Burn NFT (`burn_nft`)
**New Signature:**
```rust
pub fn burn_nft(
    ctx: Context<BurnNft>,
    collection_type: CollectionType  // NEW: Specify which collection to burn from
) -> Result<()>
```

**Behavior:**
- Decrements the specific collection's `current_reserved_count`

### 5. Admin Update Functions
All update functions now require a `collection_type` parameter to specify which collection to update:

#### Update Mint Fee
```rust
pub fn update_mint_fee(
    ctx: Context<UpdateAdminInfo>,
    collection_type: CollectionType,  // NEW
    mint_fee: u64
) -> Result<()>
```

#### Update Max Supply
```rust
pub fn update_max_supply(
    ctx: Context<UpdateAdminInfo>,
    collection_type: CollectionType,  // NEW
    max_supply: u64
) -> Result<()>
```

#### Update Collection Mint
```rust
pub fn update_collection_mint(
    ctx: Context<UpdateAdminInfo>,
    collection_type: CollectionType,  // NEW
    collection_mint: Pubkey
) -> Result<()>
```

**Note:** `update_mint_start_date` does NOT require collection_type as it's shared across all collections.

### 6. Error Codes
Added new error code:
```rust
InvalidCollectionMint  // "Invalid collection mint - cannot be empty"
```

## Usage Examples

### Initialize with 3 Collections
```typescript
await program.methods
  .initAdmin(
    // OG Collection
    ogCollectionMint,
    new BN(5_000_000),  // 5 USDC
    new BN(100),        // max 100 NFTs
    // Regular Collection
    regularCollectionMint,
    new BN(3_000_000),  // 3 USDC
    new BN(500),        // max 500 NFTs
    // Basic Collection
    basicCollectionMint,
    new BN(1_000_000),  // 1 USDC
    new BN(1000),       // max 1000 NFTs
    // Shared
    withdrawWallet,
    new BN(Date.now() / 1000)
  )
  .rpc();
```

### Mint from Specific Collection
```typescript
// Mint OG NFT
await program.methods
  .mintNft(
    { og: {} },  // CollectionType::OG
    "OG NFT #1",
    "OG",
    "https://..."
  )
  .accounts({
    collectionMint: ogCollectionMint,
    // ... other accounts
  })
  .rpc();

// Mint Regular NFT
await program.methods
  .mintNft(
    { regular: {} },  // CollectionType::Regular
    "Regular NFT #1",
    "REG",
    "https://..."
  )
  .accounts({
    collectionMint: regularCollectionMint,
    // ... other accounts
  })
  .rpc();
```

### Update Collection-Specific Parameters
```typescript
// Update OG collection mint fee
await program.methods
  .updateMintFee(
    { og: {} },
    new BN(6_000_000)  // 6 USDC
  )
  .rpc();

// Update Regular collection max supply
await program.methods
  .updateMaxSupply(
    { regular: {} },
    new BN(600)
  )
  .rpc();
```

## Migration Notes

### Breaking Changes
1. **init_admin** now requires 11 parameters instead of 5
2. **mint_nft** requires `collection_type` as first parameter
3. **burn_nft** requires `collection_type` parameter
4. **update_mint_fee** requires `collection_type` parameter
5. **update_max_supply** requires `collection_type` parameter
6. `update_og_collection` renamed to `update_collection_mint` with `collection_type` parameter

### Account Space
The `AdminState` account size has increased due to storing 3 collection configs. The `space()` function has been updated accordingly.

### Backward Compatibility
This is a **breaking change**. Existing deployments will need to:
1. Migrate data to the new structure
2. Update all client code to use new function signatures
3. Redeploy the program

## Benefits
1. **Flexible Pricing**: Each collection can have different mint fees
2. **Independent Supply Control**: Each collection has its own max supply
3. **Separate Tracking**: Current minted count tracked independently per collection
4. **Shared Configuration**: payment_mint and mint_start_date remain consistent across all collections
5. **Scalability**: Easy to query and manage each collection independently

