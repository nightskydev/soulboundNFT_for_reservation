# Test and Script Updates Summary

## Overview
All tests and scripts have been updated to support the new 3-collection structure (OG, Regular, Basic).

## Updated Files

### 1. Test Setup (`tests/setup.ts`)
**Changes:**
- Added separate mint fee constants for each collection:
  - `OG_MINT_FEE = 5 USDC`
  - `REGULAR_MINT_FEE = 3 USDC`
  - `BASIC_MINT_FEE = 1 USDC`
- Added separate max supply constants:
  - `OG_MAX_SUPPLY = 100`
  - `REGULAR_MAX_SUPPLY = 500`
  - `BASIC_MAX_SUPPLY = 1000`
- Added collection mint tracking: `ogCollectionMint`, `regularCollectionMint`, `basicCollectionMint`
- Updated `assertAdminState` helper to validate collection configs

### 2. Init Admin Test (`tests/1_init_admin.test.ts`)
**Changes:**
- Creates 3 collection mints before initialization
- Passes all 11 parameters to `initAdmin`:
  - OG collection: mint, fee (5 USDC), max supply (100)
  - Regular collection: mint, fee (3 USDC), max supply (500)
  - Basic collection: mint, fee (1 USDC), max supply (1000)
  - Shared: withdraw wallet, mint start date
- Verifies all 3 collection configs are initialized correctly
- Verifies all collection counts start at 0

### 3. Mint NFT Test (`tests/4_mint_nft.test.ts`)
**Changes:**
- Tests minting from all 3 collections
- Verifies different mint fees are charged:
  - OG: 5 USDC
  - Regular: 3 USDC
  - Basic: 1 USDC
- Verifies collection counts increment independently
- Tests include:
  - `should mint OG NFT successfully`
  - `should mint Regular NFT successfully`
  - `should mint Basic NFT successfully`
  - `should allow user to mint multiple NFTs from different collections`
  - `should verify different collection fees`

### 4. Burn NFT Test (`tests/5_burn_nft.test.ts`)
**Changes:**
- Mints one NFT from each collection in `before()` hook
- Tests burning from each collection type:
  - `should burn OG NFT successfully`
  - `should burn Regular NFT successfully`
  - `should burn Basic NFT successfully`
- Verifies collection counts decrement independently
- Verifies other collection counts remain unchanged after burn

### 5. Init Admin Script (`scripts/init_admin.ts`)
**Changes:**
- Updated configuration section with 3 collection parameters:
  ```typescript
  const OG_COLLECTION_MINT = new PublicKey("YOUR_OG_COLLECTION_MINT_HERE");
  const OG_MINT_FEE = 5_000_000; // 5 USDC
  const OG_MAX_SUPPLY = 100;
  
  const REGULAR_COLLECTION_MINT = new PublicKey("YOUR_REGULAR_COLLECTION_MINT_HERE");
  const REGULAR_MINT_FEE = 3_000_000; // 3 USDC
  const REGULAR_MAX_SUPPLY = 500;
  
  const BASIC_COLLECTION_MINT = new PublicKey("YOUR_BASIC_COLLECTION_MINT_HERE");
  const BASIC_MINT_FEE = 1_000_000; // 1 USDC
  const BASIC_MAX_SUPPLY = 1000;
  ```
- Validates all collection mints are set
- Passes all parameters to `initAdmin()`
- Displays all collection configs after initialization

### 6. Mint NFT Script (`scripts/mint_nft.ts`)
**New Usage:**
```bash
npx ts-node scripts/mint_nft.ts <COLLECTION_TYPE> <COLLECTION_MINT_ADDRESS> [NFT_NAME] [NFT_SYMBOL] [NFT_URI]
```

**Changes:**
- Added required `collection_type` parameter ('og', 'regular', or 'basic')
- Validates collection mint matches admin state
- Fetches correct collection config based on type
- Uses collection-specific mint fee
- Displays collection info:
  - Collection Mint
  - Mint Fee
  - Max Supply
  - Current Count

**Examples:**
```bash
# Mint OG NFT
npx ts-node scripts/mint_nft.ts og <OG_COLLECTION_MINT>

# Mint Regular NFT
npx ts-node scripts/mint_nft.ts regular <REGULAR_COLLECTION_MINT> "My NFT" "MNFT"

# Mint Basic NFT  
npx ts-node scripts/mint_nft.ts basic <BASIC_COLLECTION_MINT>
```

### 7. Update Mint Fee Script (`scripts/update_mint_fee.ts`)
**New Usage:**
```bash
npx ts-node scripts/update_mint_fee.ts <COLLECTION_TYPE> [FEE_IN_USDC]
```

**Changes:**
- Added required `collection_type` parameter
- Updates fee for specific collection only
- Displays current and updated fees for that collection

**Examples:**
```bash
# Update OG collection fee to 6 USDC
npx ts-node scripts/update_mint_fee.ts og 6.0

# Update Regular collection fee to 4 USDC
npx ts-node scripts/update_mint_fee.ts regular 4.0

# Update Basic collection fee to 2 USDC
npx ts-node scripts/update_mint_fee.ts basic 2.0
```

### 8. Update Collection Mint Script (`scripts/update_collection_mint.ts`)
**New Script** (replaces `update_og_collection.ts`)

**Usage:**
```bash
npx ts-node scripts/update_collection_mint.ts <COLLECTION_TYPE> <COLLECTION_MINT_ADDRESS>
```

**Features:**
- Updates collection mint address for specific collection type
- Works for all 3 collections (og, regular, basic)

**Examples:**
```bash
# Update OG collection mint
npx ts-node scripts/update_collection_mint.ts og <NEW_OG_COLLECTION_MINT>

# Update Regular collection mint
npx ts-node scripts/update_collection_mint.ts regular <NEW_REGULAR_COLLECTION_MINT>

# Update Basic collection mint
npx ts-node scripts/update_collection_mint.ts basic <NEW_BASIC_COLLECTION_MINT>
```

## Running Tests

To run all tests:
```bash
anchor test
```

To run specific test files:
```bash
# Init admin test
npx ts-mocha -p ./tsconfig.json -t 1000000 tests/1_init_admin.test.ts

# Mint NFT test
npx ts-mocha -p ./tsconfig.json -t 1000000 tests/4_mint_nft.test.ts

# Burn NFT test
npx ts-mocha -p ./tsconfig.json -t 1000000 tests/5_burn_nft.test.ts
```

## Key Testing Differences

### Before (Single Collection)
- Single mint fee for all NFTs
- Single max supply limit
- Single counter for all minted NFTs

### After (Three Collections)
- Each collection has its own:
  - Mint fee (OG: 5 USDC, Regular: 3 USDC, Basic: 1 USDC)
  - Max supply (OG: 100, Regular: 500, Basic: 1000)
  - Minted count (tracked separately)
- Shared across all collections:
  - Payment mint (USDC)
  - Mint start date

## Migration Notes for Existing Projects

1. **Update init_admin calls**: Add 9 new parameters (3 per collection)
2. **Update mint_nft calls**: Add collection_type as first parameter
3. **Update burn_nft calls**: Add collection_type parameter
4. **Update update_mint_fee calls**: Add collection_type parameter
5. **Update admin update functions**: Most now require collection_type
6. **Delete old script**: Remove `scripts/update_og_collection.ts`, use `scripts/update_collection_mint.ts` instead

## Test Coverage

All tests verify:
- ✅ Each collection can be minted independently
- ✅ Each collection charges correct fee
- ✅ Each collection tracks count separately
- ✅ Burning from one collection doesn't affect others
- ✅ Max supply limits work per collection
- ✅ Payment mint is shared across all collections
- ✅ Mint start date applies to all collections

## Next Steps

1. Create the 3 collection NFTs using `create_collection_nft` instruction
2. Run `init_admin` script with collection addresses
3. Use updated `mint_nft` script to mint NFTs from each collection
4. Test burning NFTs from different collections
5. Verify collection counts are tracked separately

