# Soulbound NFT for Reservation - Test Suite

This directory contains comprehensive tests for the Soulbound NFT smart contract.

## Test Structure

### Individual Test Files
- `1_init_admin.test.ts` - Admin state initialization
- `2_create_collection.test.ts` - Collection creation
- `3_update_admin.test.ts` - Admin parameter updates
- `4_mint_nft.test.ts` - NFT minting functionality
- `5_burn_nft.test.ts` - NFT burning
- `7_withdraw.test.ts` - Fund withdrawal
- `8_update_payment_mint.test.ts` - Payment mint updates

### Comprehensive Test
- `comprehensive.test.ts` - Complete end-to-end user journey test

### Setup
- `setup.ts` - Shared test context and utilities

## Running Tests

### Run All Tests
```bash
anchor test
```

### Run Specific Test Files
```bash
# Run only init admin tests
anchor test -- --grep "init_admin"

# Run only comprehensive test
anchor test -- --grep "Complete User Journey"

# Run only NFT-related tests
anchor test -- --grep "mint_nft|burn_nft"
```

## Test Coverage

The test suite covers:

### ✅ Core Functionality
- **Admin Management**: Initialize and update admin parameters
- **Collection Creation**: Create OG collections
- **NFT Minting**: Mint NFTs with payment and collection support
- **NFT Burning**: Complete NFT lifecycle
- **Fund Management**: Withdrawal functionality

### ✅ User Journeys
- **Complete Flow**: Admin setup → Collections → Minting → Burning
- **Error Handling**: Duplicate operations, invalid states
- **Permission Checks**: Access control validation

### ✅ Integration Features
- **Metaplex Compatibility**: Token Metadata program integration
- **Payment Processing**: Both Token and Token2022 support
- **Collection Grouping**: Proper NFT organization

## Test Architecture

### Shared Context (`setup.ts`)
- Singleton test context with persistent state
- Mock USDC token setup
- User accounts with pre-funded wallets
- PDA derivation helpers
- State fetching utilities

### Test Organization
- **Success Cases**: Verify expected functionality
- **Failure Cases**: Ensure proper error handling
- **Integration Tests**: Full user journey validation

## Key Test Scenarios

1. **Admin Initialization**
   - PDA creation and state validation
   - Parameter correctness

2. **Collection Management**
   - Metaplex collection creation
   - Master edition setup
   - Admin state updates

3. **NFT Operations**
   - Payment processing
   - Metadata creation
   - Collection association
   - Burning mechanics

4. **Security & Access Control**
   - Permission validation
   - Duplicate operation prevention
   - State consistency

## Running Tests Locally

1. **Start local Solana validator:**
   ```bash
   solana-test-validator
   ```

2. **Deploy program:**
   ```bash
   anchor build && anchor deploy
   ```

3. **Run tests:**
   ```bash
   anchor test
   ```

## Test Results

All tests should pass with comprehensive coverage of the smart contract functionality. The comprehensive test provides a complete validation of the user experience from initial setup through NFT lifecycle management.
