use anchor_lang::prelude::*;
use anchor_lang::system_program;
use crate::state::*;
use crate::errors::ForexError;
use crate::constants::*;

#[derive(Accounts)]
#[instruction(position_id: u64)]
pub struct OpenPosition<'info> {
    #[account(
        mut,
        seeds = [EXCHANGE_SEED],
        bump = exchange.bump,
        constraint = !exchange.is_paused @ ForexError::ExchangePaused,
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
        init,
        payer = trader,
        space = 8 + Position::INIT_SPACE,
        seeds = [POSITION_SEED, trader.key().as_ref(), pair.key().as_ref(), &position_id.to_le_bytes()],
        bump,
    )]
    pub position: Account<'info, Position>,
    #[account(mut)]
    pub trader: Signer<'info>,
    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<OpenPosition>,
    _position_id: u64,
    side: Side,
    size: u64,
    collateral: u64,
    leverage: u16,
) -> Result<()> {
    let pair = &ctx.accounts.pair;
    let clock = Clock::get()?;

    require!(leverage > 0 && leverage <= pair.max_leverage, ForexError::ExcessiveLeverage);
    require!(size > 0, ForexError::InsufficientCollateral);
    require!(collateral > 0, ForexError::InsufficientCollateral);
    require!(
        size == collateral.checked_mul(leverage as u64).ok_or(ForexError::MathOverflow)?,
        ForexError::InsufficientCollateral
    );
    require!(pair.last_price > 0, ForexError::OracleStale);

    // price freshness check
    require!(
        clock.unix_timestamp.checked_sub(pair.price_updated_at)
            .ok_or(ForexError::MathOverflow)? < MAX_PRICE_AGE,
        ForexError::OracleStale
    );

    let entry_price = pair.last_price;

    // liquidation price calc
    let maintenance_amount = (size as i64)
        .checked_mul(MAINTENANCE_MARGIN_BPS as i64)
        .ok_or(ForexError::MathOverflow)?
        .checked_div(BPS_DENOMINATOR as i64)
        .ok_or(ForexError::MathOverflow)?;

    let margin_left = (collateral as i64)
        .checked_sub(maintenance_amount)
        .ok_or(ForexError::MathOverflow)?;

    let price_buffer = margin_left
        .checked_mul(PRICE_DECIMALS as i64)
        .ok_or(ForexError::MathOverflow)?
        .checked_div(size as i64)
        .ok_or(ForexError::MathOverflow)?;

    let liquidation_price: u64 = match side {
        Side::Long => {
            let liq = (entry_price as i64).checked_sub(price_buffer)
                .ok_or(ForexError::MathOverflow)?;
            if liq < 0 { 0 } else { liq as u64 }
        },
        Side::Short => {
            (entry_price as i64).checked_add(price_buffer)
                .ok_or(ForexError::MathOverflow)? as u64
        },
    };

    // update open interest
    match side {
        Side::Long => {
            ctx.accounts.pair.open_interest_long = pair.open_interest_long
                .checked_add(size)
                .ok_or(ForexError::MathOverflow)?;
        },
        Side::Short => {
            ctx.accounts.pair.open_interest_short = pair.open_interest_short
                .checked_add(size)
                .ok_or(ForexError::MathOverflow)?;
        },
    }

    ctx.accounts.exchange.total_volume = ctx.accounts.exchange.total_volume
        .checked_add(size)
        .ok_or(ForexError::MathOverflow)?;

    // state updates done — now CPI transfer collateral
    system_program::transfer(
        CpiContext::new(
            ctx.accounts.system_program.key(),
            system_program::Transfer {
                from: ctx.accounts.trader.to_account_info(),
                to: ctx.accounts.exchange.to_account_info(),
            },
        ),
        collateral,
    )?;

    let position = &mut ctx.accounts.position;
    position.trader = ctx.accounts.trader.key();
    position.pair = ctx.accounts.pair.key();
    position.side = side;
    position.size = size;
    position.collateral = collateral;
    position.entry_price = entry_price;
    position.liquidation_price = liquidation_price;
    position.leverage = leverage;
    position.unrealized_pnl = 0;
    position.borrowing_fee_accrued = 0;
    position.opened_at = clock.unix_timestamp;
    position.bump = ctx.bumps.position;

    Ok(())
}
