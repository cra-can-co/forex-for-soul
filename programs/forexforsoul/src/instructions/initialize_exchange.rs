use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{Mint, Token, TokenAccount};
use crate::state::{Exchange, LiquidityPool};
use crate::constants::{EXCHANGE_SEED, POOL_SEED};

#[derive(Accounts)]
pub struct InitializeExchange<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + Exchange::INIT_SPACE,
        seeds = [EXCHANGE_SEED],
        bump,
    )]
    pub exchange: Account<'info, Exchange>,

    #[account(
        init,
        payer = authority,
        space = 8 + LiquidityPool::INIT_SPACE,
        seeds = [POOL_SEED],
        bump,
    )]
    pub pool: Account<'info, LiquidityPool>,

    pub usdc_mint: Account<'info, Mint>,

    // PDA-owned associated token account that holds every trader's collateral
    // and LP deposits. Initialised atomically with the exchange so we never
    // end up with a half-configured state.
    #[account(
        init,
        payer = authority,
        associated_token::mint = usdc_mint,
        associated_token::authority = exchange,
    )]
    pub vault: Account<'info, TokenAccount>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handler(ctx: Context<InitializeExchange>) -> Result<()> {
    let ex = &mut ctx.accounts.exchange;
    ex.authority = ctx.accounts.authority.key();
    ex.usdc_mint = ctx.accounts.usdc_mint.key();
    ex.vault = ctx.accounts.vault.key();
    ex.total_pairs = 0;
    ex.total_volume = 0;
    ex.total_fees_collected = 0;
    ex.is_paused = false;
    ex.bump = ctx.bumps.exchange;

    let pool = &mut ctx.accounts.pool;
    pool.total_deposits = 0;
    pool.total_shares = 0;
    pool.utilization_rate = 0;
    pool.base_apy = 0;
    pool.fees_collected = 0;
    pool.bump = ctx.bumps.pool;

    Ok(())
}
