#!/bin/bash

# Soulbound NFT Test Runner
# Usage: ./scripts/run-tests.sh [test-type]

set -e

echo "🚀 Soulbound NFT Test Runner"
echo "============================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if anchor is installed
if ! command -v anchor &> /dev/null; then
    print_error "Anchor CLI is not installed. Please install it first."
    exit 1
fi

# Check if solana-test-validator is available
if ! command -v solana-test-validator &> /dev/null; then
    print_error "Solana CLI is not installed. Please install it first."
    exit 1
fi

# Default test type
TEST_TYPE=${1:-"all"}

case $TEST_TYPE in
    "comprehensive")
        print_status "Running comprehensive test suite..."
        yarn run ts-mocha -p ./tsconfig.json -t 1000000 tests/comprehensive.test.ts
        ;;
    "admin")
        print_status "Running admin-related tests..."
        yarn run ts-mocha -p ./tsconfig.json -t 1000000 tests/1_init_admin.test.ts tests/3_update_admin.test.ts
        ;;
    "nft")
        print_status "Running NFT-related tests..."
        yarn run ts-mocha -p ./tsconfig.json -t 1000000 tests/4_mint_nft.test.ts tests/7_burn_nft.test.ts
        ;;
    "commerce")
        print_status "Running commerce-related tests..."
        yarn run ts-mocha -p ./tsconfig.json -t 1000000 tests/8_purchase_dongle.test.ts tests/6_withdraw.test.ts tests/6_withdraw_all.test.ts
        ;;
    "all")
        print_status "Running all tests..."
        anchor test
        ;;
    *)
        print_error "Invalid test type: $TEST_TYPE"
        echo "Usage: $0 [test-type]"
        echo "Available test types:"
        echo "  comprehensive - Run complete user journey test"
        echo "  admin         - Run admin initialization and update tests"
        echo "  nft           - Run NFT minting and burning tests"
        echo "  commerce      - Run purchase and withdrawal tests"
        echo "  all           - Run all tests (default)"
        exit 1
        ;;
esac

if [ $? -eq 0 ]; then
    print_success "All tests passed! ✅"
else
    print_error "Some tests failed! ❌"
    exit 1
fi
