use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum Side {
    Long,
    Short,
}

#[account]
#[derive(InitSpace)]
pub struct Position {
    pub trader: Pubkey,
    pub pair: Pubkey,
    pub side: Side,
    pub size: u64,                 // notional USDC (6 decimals) = collateral * leverage
    pub collateral: u64,           // USDC locked as margin
    pub entry_price: u64,          // scaled by 1e8
    pub liquidation_price: u64,    // scaled by 1e8
    pub leverage: u16,
    pub fees_paid: u64,            // total USDC paid in fees on open + close
    pub opened_at: i64,
    pub bump: u8,
}
