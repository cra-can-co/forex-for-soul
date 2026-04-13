use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct TradingPair {
    #[max_len(8)]
    pub base_currency: String,    // EUR, GBP, JPY
    #[max_len(8)]
    pub quote_currency: String,   // USD
    pub pyth_feed_id: [u8; 32],
    pub max_leverage: u16,        // 100 = 100x
    pub funding_rate: i64,        // funding rate per 8h in bps
    pub open_interest_long: u64,
    pub open_interest_short: u64,
    pub total_volume: u64,
    pub spread_bps: u16,          // adaptive spread
    pub last_price: u64,           // current price scaled by 1e8
    pub price_updated_at: i64,     // unix timestamp of last update
    pub is_active: bool,
    pub bump: u8,
}
