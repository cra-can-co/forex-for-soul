use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct Exchange {
    pub authority: Pubkey,
    pub lp_mint: Pubkey,
    pub vault: Pubkey,
    pub total_pairs: u16,
    pub total_volume: u64,
    pub is_paused: bool,
    pub bump: u8,
}
