use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
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
        constraint = exchange.vault == vault.key() @ ForexError::InvalidVault,
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
        seeds = [POOL_SEED],
        bump = pool.bump,
    )]
    pub pool: Account<'info, LiquidityPool>,

    #[account(
        init,
        payer = trader,
        space = 8 + Position::INIT_SPACE,
        seeds = [POSITION_SEED, trader.key().as_ref(), pair.key().as_ref(), &position_id.to_le_bytes()],
        bump,
    )]
    pub position: Account<'info, Position>,

    // User's USDC account — validated via mint + authority constraints.
    #[account(
        mut,
        constraint = user_usdc.mint == exchange.usdc_mint @ ForexError::InvalidUsdcMint,
        constraint = user_usdc.owner == trader.key() @ ForexError::Unauthorized,
    )]
    pub user_usdc: Account<'info, TokenAccount>,

    // Protocol-owned vault ATA (authority = exchange PDA).
    #[account(
        mut,
        constraint = vault.mint == exchange.usdc_mint @ ForexError::InvalidUsdcMint,
        constraint = vault.owner == exchange.key() @ ForexError::InvalidVault,
    )]
    pub vault: Account<'info, TokenAccount>,

    #[account(mut)]
    pub trader: Signer<'info>,

    pub token_program: Program<'info, Token>,
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
    require!(collateral > 0, ForexError::InsufficientCollateral);
    require!(size > 0, ForexError::InsufficientCollateral);
    require!(
        size == collateral.checked_mul(leverage as u64).ok_or(ForexError::MathOverflow)?,
        ForexError::InsufficientCollateral
    );
    require!(pair.last_price > 0, ForexError::OracleStale);
    require!(
        clock.unix_timestamp.checked_sub(pair.price_updated_at)
            .ok_or(ForexError::MathOverflow)? < MAX_PRICE_AGE,
        ForexError::OracleStale
    );

    let entry_price = pair.last_price;

    // Liquidation price: the price at which equity (collateral + pnl) equals
    // maintenance margin (size * 1%).
    //   equity = collateral + size * (exit − entry) / entry (long)
    //   liq_long: collateral + size*(liq-entry)/entry == maintenance
    //      → liq = entry − entry*(collateral - maintenance)/size
    //   liq_short symmetric (price rises).
    let maintenance = (size as u128)
        .checked_mul(MAINTENANCE_MARGIN_BPS as u128)
        .ok_or(ForexError::MathOverflow)?
        .checked_div(BPS_DENOMINATOR as u128)
        .ok_or(ForexError::MathOverflow)? as u64;

    require!(collateral > maintenance, ForexError::InsufficientCollateral);

    let margin_cushion = collateral.checked_sub(maintenance).ok_or(ForexError::MathOverflow)?;
    let price_delta = (entry_price as u128)
        .checked_mul(margin_cushion as u128)
        .ok_or(ForexError::MathOverflow)?
        .checked_div(size as u128)
        .ok_or(ForexError::MathOverflow)? as u64;

    let liquidation_price: u64 = match side {
        Side::Long => entry_price.saturating_sub(price_delta),
        Side::Short => entry_price.checked_add(price_delta).ok_or(ForexError::MathOverflow)?,
    };

    // Open fee: size × spread_bps / BPS. Charged on top of collateral; fees
    // accrue to pool.fees_collected to be split with LPs in future ix.
    let open_fee = (size as u128)
        .checked_mul(pair.spread_bps as u128)
        .ok_or(ForexError::MathOverflow)?
        .checked_div(BPS_DENOMINATOR as u128)
        .ok_or(ForexError::MathOverflow)? as u64;

    // Snapshot the values we need before we start mutating — otherwise the
    // borrow checker trips on mixing `&pair` (immutable) with `&mut pair`.
    let prev_long = pair.open_interest_long;
    let prev_short = pair.open_interest_short;
    let prev_volume = pair.total_volume;

    // Track OI + volume BEFORE the external CPI (classic checks-effects-interactions).
    let pair_mut = &mut ctx.accounts.pair;
    match side {
        Side::Long => {
            pair_mut.open_interest_long = prev_long
                .checked_add(size).ok_or(ForexError::MathOverflow)?;
        }
        Side::Short => {
            pair_mut.open_interest_short = prev_short
                .checked_add(size).ok_or(ForexError::MathOverflow)?;
        }
    }
    pair_mut.total_volume = prev_volume
        .checked_add(size).ok_or(ForexError::MathOverflow)?;

    ctx.accounts.exchange.total_volume = ctx.accounts.exchange.total_volume
        .checked_add(size).ok_or(ForexError::MathOverflow)?;
    ctx.accounts.exchange.total_fees_collected = ctx.accounts.exchange.total_fees_collected
        .checked_add(open_fee).ok_or(ForexError::MathOverflow)?;
    ctx.accounts.pool.fees_collected = ctx.accounts.pool.fees_collected
        .checked_add(open_fee).ok_or(ForexError::MathOverflow)?;

    // Transfer collateral + fee from trader to vault.
    let to_vault = collateral.checked_add(open_fee).ok_or(ForexError::MathOverflow)?;
    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.key(),
            Transfer {
                from: ctx.accounts.user_usdc.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
                authority: ctx.accounts.trader.to_account_info(),
            },
        ),
        to_vault,
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
    position.fees_paid = open_fee;
    position.opened_at = clock.unix_timestamp;
    position.bump = ctx.bumps.position;

    Ok(())
}
