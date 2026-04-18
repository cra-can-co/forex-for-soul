use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use crate::state::*;
use crate::errors::ForexError;
use crate::constants::*;

#[derive(Accounts)]
pub struct WithdrawLiquidity<'info> {
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
        mut,
        seeds = [LP_DEPOSIT_SEED, depositor.key().as_ref()],
        bump = lp_deposit.bump,
        constraint = lp_deposit.depositor == depositor.key() @ ForexError::Unauthorized,
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
}

pub fn handler(ctx: Context<WithdrawLiquidity>, shares: u64) -> Result<()> {
    require!(shares > 0, ForexError::InsufficientShares);
    require!(ctx.accounts.lp_deposit.shares >= shares, ForexError::InsufficientShares);
    require!(ctx.accounts.pool.total_shares > 0, ForexError::PoolEmpty);

    let total_deposits = ctx.accounts.pool.total_deposits;
    let total_shares = ctx.accounts.pool.total_shares;

    let amount = (shares as u128)
        .checked_mul(total_deposits as u128).ok_or(ForexError::MathOverflow)?
        .checked_div(total_shares as u128).ok_or(ForexError::MathOverflow)? as u64;

    ctx.accounts.pool.total_deposits = total_deposits
        .checked_sub(amount).ok_or(ForexError::MathOverflow)?;
    ctx.accounts.pool.total_shares = total_shares
        .checked_sub(shares).ok_or(ForexError::MathOverflow)?;
    ctx.accounts.lp_deposit.shares = ctx.accounts.lp_deposit.shares
        .checked_sub(shares).ok_or(ForexError::MathOverflow)?;

    // Transfer USDC out from vault to depositor, signed by exchange PDA.
    if amount > 0 {
        let bump = [ctx.accounts.exchange.bump];
        let seeds: &[&[u8]] = &[EXCHANGE_SEED, bump.as_slice()];
        let signer_seeds: &[&[&[u8]]] = &[seeds];
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.key(),
                Transfer {
                    from: ctx.accounts.vault.to_account_info(),
                    to: ctx.accounts.depositor_usdc.to_account_info(),
                    authority: ctx.accounts.exchange.to_account_info(),
                },
                signer_seeds,
            ),
            amount,
        )?;
    }

    Ok(())
}
