pub const EXCHANGE_SEED: &[u8] = b"exchange";
pub const PAIR_SEED: &[u8] = b"pair";
pub const POSITION_SEED: &[u8] = b"position";
pub const POOL_SEED: &[u8] = b"lp_pool";
pub const USER_SEED: &[u8] = b"user";
pub const LP_DEPOSIT_SEED: &[u8] = b"lp_deposit";

pub const PRICE_DECIMALS: u64 = 100_000_000; // 1e8
pub const BPS_DENOMINATOR: u64 = 10_000;

// liquidation threshold: maintenance margin = 1%
pub const MAINTENANCE_MARGIN_BPS: u64 = 100;

// max age of price feed before considered stale (60 seconds)
pub const MAX_PRICE_AGE: i64 = 60;
