use anchor_lang::prelude::*;

mod constants;
mod errors;
mod instructions;
mod state;

use instructions::*;

declare_id!("ERSbyEx6s4MJnAem1vjmZW8Wv2cQdx1U4Fytuo6qy8ro");

#[program]
pub mod forexforsoul {
    use super::*;

    pub fn initialize_exchange(ctx: Context<InitializeExchange>) -> Result<()> {
        instructions::initialize_exchange::handler(ctx)
    }

    pub fn open_position(
        ctx: Context<OpenPosition>,
        position_id: u64,
        side: state::Side,
        size: u64,
        collateral: u64,
        leverage: u16,
    ) -> Result<()> {
        instructions::open_position::handler(ctx, position_id, side, size, collateral, leverage)
    }

    pub fn close_position(ctx: Context<ClosePosition>) -> Result<()> {
        instructions::close_position::handler(ctx)
    }
}
