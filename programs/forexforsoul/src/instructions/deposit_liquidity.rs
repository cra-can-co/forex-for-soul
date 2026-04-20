use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use crate::state::*;
use crate::errors::ForexError;
use crate::constants::*;

#[derive(Accounts)]
pub struct DepositLiquidity<'info> {
    #[account(
        seeds = [EXCHANGE_SEED],
        bump = exchange.bump,
        constraint = exchange.vault == vault.key() @ ForexError::InvalidVault,
    )]
    pub exchange: Account<'info, Exchange>,

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

    #[account(
        mut,
        constraint = depositor_usdc.mint == exchange.usdc_mint @ ForexError::InvalidUsdcMint,
        constraint = depositor_usdc.owner == depositor.key() @ ForexError::Unauthorized,
    )]
    pub depositor_usdc: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = vault.mint == exchange.usdc_mint @ ForexError::InvalidUsdcMint,
        constraint = vault.owner == exchange.key() @ ForexError::InvalidVault,
    )]
    pub vault: Account<'info, TokenAccount>,

    #[account(mut)]
    pub depositor: Signer<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<DepositLiquidity>, amount: u64) -> Result<()> {
    require!(amount > 0, ForexError::InsufficientCollateral);
    let clock = Clock::get()?;
    let pool = &mut ctx.accounts.pool;

    // First deposit gets 1:1, later proportional to the pool backing.
    let shares = if pool.total_shares == 0 || pool.total_deposits == 0 {
        amount
    } else {
        (amount as u128)
            .checked_mul(pool.total_shares as u128).ok_or(ForexError::MathOverflow)?
            .checked_div(pool.total_deposits as u128).ok_or(ForexError::MathOverflow)? as u64
    };

    pool.total_deposits = pool.total_deposits
        .checked_add(amount).ok_or(ForexError::MathOverflow)?;
    pool.total_shares = pool.total_shares
        .checked_add(shares).ok_or(ForexError::MathOverflow)?;

    let deposit = &mut ctx.accounts.lp_deposit;
    deposit.depositor = ctx.accounts.depositor.key();
    deposit.shares = deposit.shares
        .checked_add(shares).ok_or(ForexError::MathOverflow)?;
    deposit.deposited_at = clock.unix_timestamp;
    deposit.bump = ctx.bumps.lp_deposit;

    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.key(),
            Transfer {
                from: ctx.accounts.depositor_usdc.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
                authority: ctx.accounts.depositor.to_account_info(),
            },
        ),
        amount,
    )?;

    Ok(())
}
