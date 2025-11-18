## Soulbound NFT for authenticator reservation

`` 


``

### necessary version

solana-cli 2.1.18 (src:f91c2fca; feat:3271415109, client:Agave)

anchor-cli 0.30.0

rustc 1.89.0-nightly (4d08223c0 2025-05-31)



### Need to update

Calculate correct data size 

Think about group - not important for our use case

Don't need to worry about FT mark(instead of NFT) - it is related to NonTransferrable Extension

Need to add withdraw_fee function - will be different (SOL/SPL payment) 

No need to check previous_admin vs new_admin - because this update_admin function updates all info at once including mint_fee