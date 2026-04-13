use anchor_lang::prelude::*;
use crate::state::*;
use crate::errors::ForexError;
use crate::constants::*;

#[derive(Accounts)]
pub struct WithdrawLiquidity<'info> {
    #[account(
        mut,
        seeds = [POOL_SEED],
        bump = pool.bump,
    )]
    pub pool: Account<'info, LiquidityPool>,
    #[account(
        mut,
        seeds = [LP_DEPOSIT_SEED, depositor.key().as_ref()],
        bump = lp_deposit.bump,
        constraint = lp_deposit.depositor == depositor.key() @ ForexError::Unauthorized,
    )]
    pub lp_deposit: Account<'info, LpDeposit>,
    #[account(mut)]
    pub depositor: Signer<'info>,
}

pub fn handler(ctx: Context<WithdrawLiquidity>, shares: u64) -> Result<()> {
    require!(shares > 0, ForexError::InsufficientCollateral);
    require!(ctx.accounts.lp_deposit.shares >= shares, ForexError::InsufficientCollateral);

    let total_deposits = ctx.accounts.pool.total_deposits;
    let total_shares = ctx.accounts.pool.total_shares;

    let amount = shares
        .checked_mul(total_deposits)
        .ok_or(ForexError::MathOverflow)?
        .checked_div(total_shares)
        .ok_or(ForexError::MathOverflow)?;

    ctx.accounts.pool.total_deposits = total_deposits
        .checked_sub(amount)
        .ok_or(ForexError::MathOverflow)?;
    ctx.accounts.pool.total_shares = total_shares
        .checked_sub(shares)
        .ok_or(ForexError::MathOverflow)?;

    ctx.accounts.lp_deposit.shares = ctx.accounts.lp_deposit.shares
        .checked_sub(shares)
        .ok_or(ForexError::MathOverflow)?;

    Ok(())
}
