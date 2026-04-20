use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use crate::state::*;
use crate::errors::ForexError;
use crate::constants::*;

// Permissionless liquidation. Anyone can call when equity ≤ maintenance. The
// liquidator gets a small reward (1% of collateral) from the seized margin;
// the rest stays in the vault as bad-debt cover. The trader gets NOTHING —
// their collateral is forfeit. The position account's rent refund is sent to
// the liquidator as the incentive to keep the bot running.
#[derive(Accounts)]
pub struct LiquidatePosition<'info> {
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
        mut,
        close = liquidator,
        constraint = position.pair == pair.key() @ ForexError::Unauthorized,
    )]
    pub position: Account<'info, Position>,

    #[account(
        mut,
        constraint = vault.mint == exchange.usdc_mint @ ForexError::InvalidUsdcMint,
        constraint = vault.owner == exchange.key() @ ForexError::InvalidVault,
    )]
    pub vault: Account<'info, TokenAccount>,

    // Liquidator's USDC account — receives the bounty.
    #[account(
        mut,
        constraint = liquidator_usdc.mint == exchange.usdc_mint @ ForexError::InvalidUsdcMint,
        constraint = liquidator_usdc.owner == liquidator.key() @ ForexError::Unauthorized,
    )]
    pub liquidator_usdc: Account<'info, TokenAccount>,

    #[account(mut)]
    pub liquidator: Signer<'info>,

    pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<LiquidatePosition>) -> Result<()> {
    let clock = Clock::get()?;
    let pair = &ctx.accounts.pair;
    let position = &ctx.accounts.position;

    require!(
        clock.unix_timestamp.checked_sub(pair.price_updated_at)
            .ok_or(ForexError::MathOverflow)? < MAX_PRICE_AGE,
        ForexError::OracleStale
    );

    let current_price = pair.last_price;

    // Recompute pnl using the same formula as close_position so results align.
    let pnl: i128 = match position.side {
        Side::Long => {
            let diff = (current_price as i128).checked_sub(position.entry_price as i128)
                .ok_or(ForexError::MathOverflow)?;
            diff.checked_mul(position.size as i128).ok_or(ForexError::MathOverflow)?
                .checked_div(position.entry_price as i128).ok_or(ForexError::MathOverflow)?
        }
        Side::Short => {
            let diff = (position.entry_price as i128).checked_sub(current_price as i128)
                .ok_or(ForexError::MathOverflow)?;
            diff.checked_mul(position.size as i128).ok_or(ForexError::MathOverflow)?
                .checked_div(position.entry_price as i128).ok_or(ForexError::MathOverflow)?
        }
    };

    let maintenance = (position.size as i128)
        .checked_mul(MAINTENANCE_MARGIN_BPS as i128).ok_or(ForexError::MathOverflow)?
        .checked_div(BPS_DENOMINATOR as i128).ok_or(ForexError::MathOverflow)?;

    let equity: i128 = (position.collateral as i128)
        .checked_add(pnl).ok_or(ForexError::MathOverflow)?;

    require!(equity <= maintenance, ForexError::PositionHealthy);

    // Liquidator bounty: 1% of collateral, paid from vault. Whatever is left
    // of the collateral (after the bounty) stays in vault as bad-debt cover.
    let bounty = position.collateral
        .checked_div(100).unwrap_or(0);

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

    msg!(
        "liquidate entry={} mark={} equity={} maint={} bounty={}",
        position.entry_price, current_price, equity, maintenance, bounty,
    );

    if bounty > 0 && bounty <= ctx.accounts.vault.amount {
        let bump = [ctx.accounts.exchange.bump];
        let seeds: &[&[u8]] = &[EXCHANGE_SEED, bump.as_slice()];
        let signer_seeds: &[&[&[u8]]] = &[seeds];
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.key(),
                Transfer {
                    from: ctx.accounts.vault.to_account_info(),
                    to: ctx.accounts.liquidator_usdc.to_account_info(),
                    authority: ctx.accounts.exchange.to_account_info(),
                },
                signer_seeds,
            ),
            bounty,
        )?;
    }

    Ok(())
}
