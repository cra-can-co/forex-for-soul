use anchor_lang::prelude::*;
use crate::state::Position;
use crate::errors::ForexError;

#[derive(Accounts)]
pub struct ClosePosition<'info> {
    #[account(
        mut,
        close = trader,
        constraint = position.trader == trader.key() @ ForexError::Unauthorized,
    )]
    pub position: Account<'info, Position>,
    #[account(mut)]
    pub trader: Signer<'info>,
}

pub fn handler(ctx: Context<ClosePosition>) -> Result<()> {
    // P&L calc + collateral return in next phase
    msg!("closing position, pnl: {}", ctx.accounts.position.unrealized_pnl);
    Ok(())
}
