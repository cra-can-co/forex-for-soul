use anchor_lang::prelude::*;
use crate::state::*;
use crate::errors::ForexError;
use crate::constants::*;

#[derive(Accounts)]
pub struct UpdatePrice<'info> {
    #[account(
        seeds = [EXCHANGE_SEED],
        bump = exchange.bump,
        constraint = exchange.authority == authority.key() @ ForexError::Unauthorized,
    )]
    pub exchange: Account<'info, Exchange>,
    #[account(
        mut,
        seeds = [PAIR_SEED, pair.base_currency.as_bytes(), pair.quote_currency.as_bytes()],
        bump = pair.bump,
    )]
    pub pair: Account<'info, TradingPair>,
    pub authority: Signer<'info>,
}

pub fn handler(ctx: Context<UpdatePrice>, price: u64) -> Result<()> {
    require!(price > 0, ForexError::OracleStale);

    let clock = Clock::get()?;
    let pair = &mut ctx.accounts.pair;
    pair.last_price = price;
    pair.price_updated_at = clock.unix_timestamp;

    Ok(())
}
