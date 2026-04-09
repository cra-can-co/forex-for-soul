use anchor_lang::prelude::*;
use crate::state::*;
use crate::errors::ForexError;
use crate::constants::*;

#[derive(Accounts)]
#[instruction(position_id: u64)]
pub struct OpenPosition<'info> {
    #[account(
        seeds = [EXCHANGE_SEED],
        bump = exchange.bump,
        constraint = !exchange.is_paused @ ForexError::ExchangePaused,
    )]
    pub exchange: Account<'info, Exchange>,
    #[account(
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

// open long/short position with leverage
pub fn handler(
    ctx: Context<OpenPosition>,
    _position_id: u64,
    side: Side,
    size: u64,
    collateral: u64,
    leverage: u16,
) -> Result<()> {
    let pair = &ctx.accounts.pair;
    require!(leverage <= pair.max_leverage, ForexError::ExcessiveLeverage);
    require!(collateral > 0, ForexError::InsufficientCollateral);

    let clock = Clock::get()?;
    // entry_price would come from Pyth oracle in production
    let entry_price: u64 = PRICE_DECIMALS; // placeholder: 1.00000000

    let position = &mut ctx.accounts.position;
    position.trader = ctx.accounts.trader.key();
    position.pair = ctx.accounts.pair.key();
    position.side = side;
    position.size = size;
    position.collateral = collateral;
    position.entry_price = entry_price;
    position.liquidation_price = 0; // calc in next phase
    position.leverage = leverage;
    position.unrealized_pnl = 0;
    position.borrowing_fee_accrued = 0;
    position.opened_at = clock.unix_timestamp;
    position.bump = ctx.bumps.position;

    Ok(())
}
