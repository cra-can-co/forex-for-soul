"""Liquidation bot — scans positions and liquidates those below maintenance margin."""

import json
import struct
from pathlib import Path

from solders.keypair import Keypair
from solders.pubkey import Pubkey
from solders.instruction import Instruction, AccountMeta
from solders.transaction import Transaction
from solders.message import Message
from solana.rpc.async_api import AsyncClient
from solana.rpc.commitment import Confirmed

from config import PROGRAM_ID, RPC_URL, WALLET_PATH

LIQUIDATE_DISC = bytes([118, 4, 32, 155, 220, 79, 250, 56])
EXCHANGE_SEED = b"exchange"
POSITION_DISC = bytes([170, 188, 143, 228, 122, 64, 247, 208])  # placeholder
MAINTENANCE_MARGIN_BPS = 100
BPS_DENOM = 10_000
PRICE_DECIMALS = 100_000_000


def load_keypair(path: str) -> Keypair:
    expanded = Path(path).expanduser()
    with open(expanded) as f:
        return Keypair.from_bytes(bytes(json.load(f)))


def check_liquidatable(
    side: int, entry_price: int, current_price: int,
    size: int, collateral: int,
) -> bool:
    """Check if a position is below maintenance margin."""
    if side == 0:  # Long
        pnl = (current_price - entry_price) * size // PRICE_DECIMALS
    else:  # Short
        pnl = (entry_price - current_price) * size // PRICE_DECIMALS

    equity = collateral + pnl
    maintenance = size * MAINTENANCE_MARGIN_BPS // BPS_DENOM
    return equity <= maintenance


async def run_liquidation_bot():
    """Scan all positions and attempt to liquidate unhealthy ones."""
    program_id = Pubkey.from_string(PROGRAM_ID)
    liquidator = load_keypair(WALLET_PATH)
    client = AsyncClient(RPC_URL)

    print("[liquidator] scanning positions...")

    resp = await client.get_program_accounts(program_id, commitment=Confirmed)
    print(f"[liquidator] {len(resp.value)} total accounts found")

    # FIXME: parse position accounts by discriminator, check health, send liquidate_position
    # For devnet demo, log the scan result
    liquidated = 0
    print(f"[liquidator] cycle done — {liquidated} positions liquidated")

    await client.close()
