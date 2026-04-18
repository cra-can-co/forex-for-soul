use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use crate::state::*;
use crate::errors::ForexError;
use crate::constants::*;

#[derive(Accounts)]
pub struct ClosePosition<'info> {
    #[account(
        mut,
        seeds = [EXCHANGE_SEED],
        bump = exchange.bump,
        constraint = exchange.vault == vault.key() @ ForexError::InvalidVault,
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
        seeds = [POOL_SEED],
        bump = pool.bump,
    )]
    pub pool: Account<'info, LiquidityPool>,

    #[account(
        mut,
        close = trader,
        constraint = position.trader == trader.key() @ ForexError::Unauthorized,
    )]
    pub position: Account<'info, Position>,

    #[account(
        mut,
        constraint = user_usdc.mint == exchange.usdc_mint @ ForexError::InvalidUsdcMint,
        constraint = user_usdc.owner == trader.key() @ ForexError::Unauthorized,
    )]
    pub user_usdc: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = vault.mint == exchange.usdc_mint @ ForexError::InvalidUsdcMint,
        constraint = vault.owner == exchange.key() @ ForexError::InvalidVault,
    )]
    pub vault: Account<'info, TokenAccount>,

    #[account(mut)]
    pub trader: Signer<'info>,

    pub token_program: Program<'info, Token>,
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

    // Currency-agnostic P&L: pnl = size × (exit − entry) / entry. Works equally
    // well for EUR/USD (entry ~1.08) and USD/JPY (entry ~158). Units stay in
    // USDC-6dp the whole way.
    let pnl: i128 = match position.side {
        Side::Long => {
            let diff = (exit_price as i128).checked_sub(position.entry_price as i128)
                .ok_or(ForexError::MathOverflow)?;
            diff.checked_mul(position.size as i128).ok_or(ForexError::MathOverflow)?
                .checked_div(position.entry_price as i128).ok_or(ForexError::MathOverflow)?
        }
        Side::Short => {
            let diff = (position.entry_price as i128).checked_sub(exit_price as i128)
                .ok_or(ForexError::MathOverflow)?;
            diff.checked_mul(position.size as i128).ok_or(ForexError::MathOverflow)?
                .checked_div(position.entry_price as i128).ok_or(ForexError::MathOverflow)?
        }
    };

    let close_fee = (position.size as u128)
        .checked_mul(pair.spread_bps as u128)
        .ok_or(ForexError::MathOverflow)?
        .checked_div(BPS_DENOMINATOR as u128)
        .ok_or(ForexError::MathOverflow)? as u64;

    // Payout = collateral + pnl − close_fee, floored at 0.
    let raw_payout: i128 = (position.collateral as i128)
        .checked_add(pnl).ok_or(ForexError::MathOverflow)?
        .checked_sub(close_fee as i128).ok_or(ForexError::MathOverflow)?;
    let payout: u64 = if raw_payout > 0 { raw_payout as u64 } else { 0 };

    // State updates BEFORE external CPI (reentrancy best-practice).
    match position.side {
        Side::Long => {
            ctx.accounts.pair.open_interest_long = pair.open_interest_long
                .checked_sub(position.size).ok_or(ForexError::MathOverflow)?;
        }
        Side::Short => {
            ctx.accounts.pair.open_interest_short = pair.open_interest_short
                .checked_sub(position.size).ok_or(ForexError::MathOverflow)?;
        }
    }
    ctx.accounts.exchange.total_fees_collected = ctx.accounts.exchange.total_fees_collected
        .checked_add(close_fee).ok_or(ForexError::MathOverflow)?;
    ctx.accounts.pool.fees_collected = ctx.accounts.pool.fees_collected
        .checked_add(close_fee).ok_or(ForexError::MathOverflow)?;

    msg!(
        "close entry={} exit={} pnl={} fee={} payout={}",
        position.entry_price, exit_price, pnl, close_fee, payout,
    );

    // Transfer payout from vault → user, signed by exchange PDA.
    if payout > 0 {
        let bump = [ctx.accounts.exchange.bump];
        let seeds: &[&[u8]] = &[EXCHANGE_SEED, bump.as_slice()];
        let signer_seeds: &[&[&[u8]]] = &[seeds];
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.key(),
                Transfer {
                    from: ctx.accounts.vault.to_account_info(),
                    to: ctx.accounts.user_usdc.to_account_info(),
                    authority: ctx.accounts.exchange.to_account_info(),
                },
                signer_seeds,
            ),
            payout,
        )?;
    }

    Ok(())
}
