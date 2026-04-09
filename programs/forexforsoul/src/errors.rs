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
    #[msg("Math overflow")]
    MathOverflow,
    #[msg("Oracle price stale")]
    OracleStale,
}
