use anchor_lang::prelude::*;
use crate::state::*;
use crate::errors::ForexError;
use crate::constants::*;

#[derive(Accounts)]
pub struct ClosePosition<'info> {
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
        constraint = pair.key() == position.pair @ ForexError::Unauthorized,
    )]
    pub pair: Account<'info, TradingPair>,
    #[account(
        mut,
        close = trader,
        constraint = position.trader == trader.key() @ ForexError::Unauthorized,
    )]
    pub position: Account<'info, Position>,
    #[account(mut)]
    pub trader: Signer<'info>,
}

pub fn handler(ctx: Context<ClosePosition>) -> Result<()> {
    let clock = Clock::get()?;
    let pair = &ctx.accounts.pair;
    let position = &ctx.accounts.position;

    require!(pair.last_price > 0, ForexError::OracleStale);
    require!(
        clock.unix_timestamp.checked_sub(pair.price_updated_at)
            .ok_or(ForexError::MathOverflow)? < MAX_PRICE_AGE,
        ForexError::OracleStale
    );

    let exit_price = pair.last_price;

    // P&L calculation
    let pnl: i64 = match position.side {
        Side::Long => {
            (exit_price as i64)
                .checked_sub(position.entry_price as i64)
                .ok_or(ForexError::MathOverflow)?
                .checked_mul(position.size as i64)
                .ok_or(ForexError::MathOverflow)?
                .checked_div(PRICE_DECIMALS as i64)
                .ok_or(ForexError::MathOverflow)?
        },
        Side::Short => {
            (position.entry_price as i64)
                .checked_sub(exit_price as i64)
                .ok_or(ForexError::MathOverflow)?
                .checked_mul(position.size as i64)
                .ok_or(ForexError::MathOverflow)?
                .checked_div(PRICE_DECIMALS as i64)
                .ok_or(ForexError::MathOverflow)?
        },
    };

    // update open interest
    match position.side {
        Side::Long => {
            ctx.accounts.pair.open_interest_long = pair.open_interest_long
                .checked_sub(position.size)
                .ok_or(ForexError::MathOverflow)?;
        },
        Side::Short => {
            ctx.accounts.pair.open_interest_short = pair.open_interest_short
                .checked_sub(position.size)
                .ok_or(ForexError::MathOverflow)?;
        },
    }

    ctx.accounts.exchange.total_volume = ctx.accounts.exchange.total_volume
        .checked_add(position.size)
        .ok_or(ForexError::MathOverflow)?;

    // transfer payout from exchange PDA to trader
    let payout = (position.collateral as i64)
        .checked_add(pnl)
        .ok_or(ForexError::MathOverflow)?;

    if payout > 0 {
        let payout_amount = payout as u64;
        let exchange_info = ctx.accounts.exchange.to_account_info();
        let trader_info = ctx.accounts.trader.to_account_info();
        **exchange_info.try_borrow_mut_lamports()? = exchange_info
            .lamports()
            .checked_sub(payout_amount)
            .ok_or(ForexError::MathOverflow)?;
        **trader_info.try_borrow_mut_lamports()? = trader_info
            .lamports()
            .checked_add(payout_amount)
            .ok_or(ForexError::MathOverflow)?;
    }

    msg!("closed position — entry: {}, exit: {}, pnl: {}", position.entry_price, exit_price, pnl);

    Ok(())
}
