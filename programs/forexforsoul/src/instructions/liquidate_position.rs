use anchor_lang::prelude::*;
use crate::state::*;
use crate::errors::ForexError;
use crate::constants::*;

#[derive(Accounts)]
pub struct LiquidatePosition<'info> {
    #[account(
        mut,
        seeds = [EXCHANGE_SEED],
        bump = exchange.bump,
    )]
    pub exchange: Account<'info, Exchange>,
    #[account(
        mut,
        seeds = [PAIR_SEED, pair.base_currency.as_bytes(), pair.quote_currency.as_bytes()],
        bump = pair.bump,
        constraint = pair.is_active @ ForexError::PairNotActive,
    )]
    pub pair: Account<'info, TradingPair>,
    #[account(
        mut,
        close = liquidator,
        constraint = position.pair == pair.key() @ ForexError::Unauthorized,
        constraint = position.trader == trader.key() @ ForexError::Unauthorized,
    )]
    pub position: Account<'info, Position>,
    /// CHECK: original trader, validated via position.trader constraint
    pub trader: UncheckedAccount<'info>,
    #[account(mut)]
    pub liquidator: Signer<'info>,
}

pub fn handler(ctx: Context<LiquidatePosition>) -> Result<()> {
    let clock = Clock::get()?;
    let pair = &ctx.accounts.pair;
    let position = &ctx.accounts.position;

    // price must be fresh
    require!(
        clock.unix_timestamp.checked_sub(pair.price_updated_at)
            .ok_or(ForexError::MathOverflow)? < MAX_PRICE_AGE,
        ForexError::OracleStale
    );

    let current_price = pair.last_price;

    // calc unrealized pnl
    let pnl: i64 = match position.side {
        Side::Long => {
            (current_price as i64)
                .checked_sub(position.entry_price as i64)
                .ok_or(ForexError::MathOverflow)?
                .checked_mul(position.size as i64)
                .ok_or(ForexError::MathOverflow)?
                .checked_div(PRICE_DECIMALS as i64)
                .ok_or(ForexError::MathOverflow)?
        },
        Side::Short => {
            (position.entry_price as i64)
                .checked_sub(current_price as i64)
                .ok_or(ForexError::MathOverflow)?
                .checked_mul(position.size as i64)
                .ok_or(ForexError::MathOverflow)?
                .checked_div(PRICE_DECIMALS as i64)
                .ok_or(ForexError::MathOverflow)?
        },
    };

    // maintenance margin check
    let maintenance = (position.size as i64)
        .checked_mul(MAINTENANCE_MARGIN_BPS as i64)
        .ok_or(ForexError::MathOverflow)?
        .checked_div(BPS_DENOMINATOR as i64)
        .ok_or(ForexError::MathOverflow)?;

    let equity = (position.collateral as i64)
        .checked_add(pnl)
        .ok_or(ForexError::MathOverflow)?;

    // position must be unhealthy to liquidate
    require!(equity <= maintenance, ForexError::PositionHealthy);

    // update open interest
    match position.side {
        Side::Long => {
            ctx.accounts.pair.open_interest_long = ctx.accounts.pair.open_interest_long
                .checked_sub(position.size)
                .ok_or(ForexError::MathOverflow)?;
        },
        Side::Short => {
            ctx.accounts.pair.open_interest_short = ctx.accounts.pair.open_interest_short
                .checked_sub(position.size)
                .ok_or(ForexError::MathOverflow)?;
        },
    }

    ctx.accounts.exchange.total_volume = ctx.accounts.exchange.total_volume
        .checked_add(position.size)
        .ok_or(ForexError::MathOverflow)?;

    msg!("liquidated position, equity: {}, maintenance: {}", equity, maintenance);

    Ok(())
}
