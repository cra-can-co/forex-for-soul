use anchor_lang::prelude::*;

#[error_code]
pub enum ForexError {
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Exchange is paused")]
    ExchangePaused,
    #[msg("Trading pair not active")]
    PairNotActive,
    #[msg("Leverage exceeds maximum")]
    ExcessiveLeverage,
    #[msg("Insufficient collateral")]
    InsufficientCollateral,
    #[msg("Position is healthy, cannot liquidate")]
    PositionHealthy,
    #[msg("Numeric overflow")]
    MathOverflow,
    #[msg("Oracle price stale")]
    OracleStale,
    #[msg("Currency symbol too long (max 8 bytes)")]
    InvalidCurrency,
    #[msg("Spread exceeds maximum allowed")]
    SpreadTooHigh,
    #[msg("Vault account does not match exchange configuration")]
    InvalidVault,
    #[msg("USDC mint mismatch")]
    InvalidUsdcMint,
    #[msg("Pool has no liquidity")]
    PoolEmpty,
    #[msg("Insufficient LP shares")]
    InsufficientShares,
}
