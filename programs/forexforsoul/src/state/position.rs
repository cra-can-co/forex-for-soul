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
    pub size: u64,                  // position size in USDC
    pub collateral: u64,            // margin deposited
    pub entry_price: u64,           // scaled by 1e8
    pub liquidation_price: u64,
    pub leverage: u16,
    pub unrealized_pnl: i64,
    pub borrowing_fee_accrued: u64,
    pub opened_at: i64,
    pub bump: u8,
}
