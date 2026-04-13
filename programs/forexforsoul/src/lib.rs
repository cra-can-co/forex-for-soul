use anchor_lang::prelude::*;

pub mod constants;
pub mod errors;
pub mod instructions;
pub mod state;

use instructions::*;

declare_id!("ERSbyEx6s4MJnAem1vjmZW8Wv2cQdx1U4Fytuo6qy8ro");

#[program]
pub mod forexforsoul {
    use super::*;

    pub fn initialize_exchange(ctx: Context<InitializeExchange>) -> Result<()> {
        instructions::initialize_exchange::handler(ctx)
    }

    pub fn add_trading_pair(
        ctx: Context<AddTradingPair>,
        base_currency: String,
        quote_currency: String,
        max_leverage: u16,
        spread_bps: u16,
    ) -> Result<()> {
        instructions::add_trading_pair::handler(ctx, base_currency, quote_currency, max_leverage, spread_bps)
    }

    // ── Oracle ──

    pub fn update_price(ctx: Context<UpdatePrice>, price: u64) -> Result<()> {
        instructions::update_price::handler(ctx, price)
    }

    // ── Trading ──

    pub fn open_position(
        ctx: Context<OpenPosition>,
        position_id: u64,
        side: state::Side,
        size: u64,
        collateral: u64,
        leverage: u16,
    ) -> Result<()> {
        instructions::open_position::handler(ctx, position_id, side, size, collateral, leverage)
    }

    pub fn close_position(ctx: Context<ClosePosition>) -> Result<()> {
        instructions::close_position::handler(ctx)
    }

    pub fn liquidate_position(ctx: Context<LiquidatePosition>) -> Result<()> {
        instructions::liquidate_position::handler(ctx)
    }

    // ── Liquidity ──

    pub fn deposit_liquidity(ctx: Context<DepositLiquidity>, amount: u64) -> Result<()> {
        instructions::deposit_liquidity::handler(ctx, amount)
    }

    pub fn withdraw_liquidity(ctx: Context<WithdrawLiquidity>, shares: u64) -> Result<()> {
        instructions::withdraw_liquidity::handler(ctx, shares)
    }
}
