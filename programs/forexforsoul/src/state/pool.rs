use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct LiquidityPool {
    pub total_deposits: u64,
    pub total_shares: u64,
    pub utilization_rate: u16,     // bps
    pub base_apy: u16,
    pub fees_collected: u64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct LpDeposit {
    pub depositor: Pubkey,
    pub shares: u64,
    pub deposited_at: i64,
    pub bump: u8,
}
