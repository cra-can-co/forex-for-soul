use anchor_lang::prelude::*;
use crate::state::Exchange;
use crate::constants::EXCHANGE_SEED;

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
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<InitializeExchange>) -> Result<()> {
    let exchange = &mut ctx.accounts.exchange;
    exchange.authority = ctx.accounts.authority.key();
    exchange.total_pairs = 0;
    exchange.total_volume = 0;
    exchange.is_paused = false;
    exchange.bump = ctx.bumps.exchange;
    Ok(())
}
