use anchor_lang::prelude::*;
use crate::state::*;
use crate::errors::ForexError;
use crate::constants::*;

#[derive(Accounts)]
#[instruction(base_currency: String, quote_currency: String)]
pub struct AddTradingPair<'info> {
    #[account(
        mut,
        seeds = [EXCHANGE_SEED],
        bump = exchange.bump,
        constraint = exchange.authority == authority.key() @ ForexError::Unauthorized,
    )]
    pub exchange: Account<'info, Exchange>,
    #[account(
        init,
        payer = authority,
        space = 8 + TradingPair::INIT_SPACE,
        seeds = [PAIR_SEED, base_currency.as_bytes(), quote_currency.as_bytes()],
        bump,
    )]
    pub pair: Account<'info, TradingPair>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<AddTradingPair>,
    base_currency: String,
    quote_currency: String,
    max_leverage: u16,
    spread_bps: u16,
) -> Result<()> {
    require!(base_currency.len() <= 8, ForexError::MathOverflow);
    require!(quote_currency.len() <= 8, ForexError::MathOverflow);
    require!(max_leverage > 0 && max_leverage <= 100, ForexError::ExcessiveLeverage);

    let pair = &mut ctx.accounts.pair;
    pair.base_currency = base_currency;
    pair.quote_currency = quote_currency;
    pair.pyth_feed_id = [0u8; 32];
    pair.max_leverage = max_leverage;
    pair.funding_rate = 0;
    pair.open_interest_long = 0;
    pair.open_interest_short = 0;
    pair.total_volume = 0;
    pair.spread_bps = spread_bps;
    pair.last_price = 0;
    pair.price_updated_at = 0;
    pair.is_active = true;
    pair.bump = ctx.bumps.pair;

    ctx.accounts.exchange.total_pairs = ctx.accounts.exchange.total_pairs
        .checked_add(1)
        .ok_or(ForexError::MathOverflow)?;

    Ok(())
}
