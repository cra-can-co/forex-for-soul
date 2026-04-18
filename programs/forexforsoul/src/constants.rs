// v2 seeds — bumped when the economic model was rewritten to use an SPL-USDC
// vault. Old v1 accounts linger at the previous seeds but are untouched by
// this version of the program.
pub const EXCHANGE_SEED: &[u8] = b"exchange_v2";
pub const PAIR_SEED: &[u8] = b"pair_v2";
pub const POSITION_SEED: &[u8] = b"position_v2";
pub const POOL_SEED: &[u8] = b"lp_pool_v2";
pub const LP_DEPOSIT_SEED: &[u8] = b"lp_deposit_v2";

// Price scaling: on-chain prices stored as u64 with 8 implicit decimals.
pub const PRICE_DECIMALS: u64 = 100_000_000; // 1e8

// Size / collateral / USDC scaling: USDC is 6 decimals.
pub const USDC_DECIMALS: u8 = 6;

pub const BPS_DENOMINATOR: u64 = 10_000;

// Liquidation threshold: position is unhealthy when equity ≤ size × 1%.
pub const MAINTENANCE_MARGIN_BPS: u64 = 100;

// Maximum age of an accepted oracle price update.
pub const MAX_PRICE_AGE: i64 = 60;

// Upper bound on configurable pair spread to prevent foot-guns in add_trading_pair.
pub const MAX_SPREAD_BPS: u16 = 200; // 2.00%
