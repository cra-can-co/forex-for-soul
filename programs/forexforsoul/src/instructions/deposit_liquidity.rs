use anchor_lang::prelude::*;
use crate::state::*;
use crate::errors::ForexError;
use crate::constants::*;

#[derive(Accounts)]
pub struct DepositLiquidity<'info> {
    #[account(
        mut,
        seeds = [POOL_SEED],
        bump = pool.bump,
    )]
    pub pool: Account<'info, LiquidityPool>,
    #[account(
        init_if_needed,
        payer = depositor,
        space = 8 + LpDeposit::INIT_SPACE,
        seeds = [LP_DEPOSIT_SEED, depositor.key().as_ref()],
        bump,
    )]
    pub lp_deposit: Account<'info, LpDeposit>,
    #[account(mut)]
    pub depositor: Signer<'info>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<DepositLiquidity>, amount: u64) -> Result<()> {
    require!(amount > 0, ForexError::InsufficientCollateral);

    let clock = Clock::get()?;
    let pool = &mut ctx.accounts.pool;

    // calculate shares: first deposit gets 1:1, later proportional
    let shares = if pool.total_shares == 0 || pool.total_deposits == 0 {
        amount
    } else {
        amount
            .checked_mul(pool.total_shares)
            .ok_or(ForexError::MathOverflow)?
            .checked_div(pool.total_deposits)
            .ok_or(ForexError::MathOverflow)?
    };

    pool.total_deposits = pool.total_deposits
        .checked_add(amount)
        .ok_or(ForexError::MathOverflow)?;
    pool.total_shares = pool.total_shares
        .checked_add(shares)
        .ok_or(ForexError::MathOverflow)?;

    let deposit = &mut ctx.accounts.lp_deposit;
    deposit.depositor = ctx.accounts.depositor.key();
    deposit.shares = deposit.shares
        .checked_add(shares)
        .ok_or(ForexError::MathOverflow)?;
    deposit.deposited_at = clock.unix_timestamp;
    deposit.bump = ctx.bumps.lp_deposit;

    Ok(())
}
