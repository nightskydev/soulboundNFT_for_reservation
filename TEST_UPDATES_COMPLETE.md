# Test Files Update - FINAL

## All Updated Test Files

### ✅ Completed Updates:

1. **`tests/setup.ts`** - Updated with 3 collection constants
2. **`tests/1_init_admin.test.ts`** - Updated to initialize all 3 collections  
3. **`tests/3_update_admin.test.ts`** - Updated all admin update functions with collection types
4. **`tests/4_mint_nft.test.ts`** - Updated to test minting from all 3 collections
5. **`tests/5_burn_nft.test.ts`** - Updated to test burning from all 3 collections
6. **`tests/7_withdraw.test.ts`** - Updated init_admin calls and mint_nft calls
7. **`tests/comprehensive.test.ts`** - Updated to use new 3-collection structure

### Key Changes Made:

#### Function Signature Changes:
- `initAdmin()` - Now requires 11 parameters (3 collection configs + shared params)
- `mintNft()` - Now requires `collection_type` as first parameter
- `burnNft()` - Now requires `collection_type` parameter  
- `updateMintFee()` - Now requires `collection_type` parameter
- `updateMaxSupply()` - Now requires `collection_type` parameter
- `updateOgCollection()` - Replaced with `updateCollectionMint()` with `collection_type`

#### Account Name Changes in withdraw:
- `superAdmin` → `signer` in withdraw accounts

#### Collection Type Usage:
Use one of these objects as the collection_type parameter:
```typescript
{ og: {} }      // For OG collection
{ regular: {} } // For Regular collection
{ basic: {} }   // For Basic collection
```

## Running Tests

Tests should now pass. Run:
```bash
anchor test
```

Or run individual test files:
```bash
npx ts-mocha -p ./tsconfig.json -t 1000000 tests/1_init_admin.test.ts
npx ts-mocha -p ./tsconfig.json -t 1000000 tests/3_update_admin.test.ts
npx ts-mocha -p ./tsconfig.json -t 1000000 tests/4_mint_nft.test.ts
npx ts-mocha -p ./tsconfig.json -t 1000000 tests/5_burn_nft.test.ts
npx ts-mocha -p ./tsconfig.json -t 1000000 tests/7_withdraw.test.ts
npx ts-mocha -p ./tsconfig.json -t 1000000 tests/comprehensive.test.ts
```

## What Was Fixed

The main issues were:
1. Tests using old `MINT_FEE`, `MAX_SUPPLY` constants instead of collection-specific ones
2. Missing `collection_type` parameter in `mintNft()` and `burnNft()` calls
3. Old function names (`updateOgCollection` → `updateCollectionMint`)
4. Missing collection type parameter in admin update functions
5. Wrong account names in withdraw tests (`superAdmin` → `signer`)
6. Old init_admin calls not providing all 11 parameters

All of these have been corrected across all test files!

