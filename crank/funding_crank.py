"""Funding rate crank — calculates and logs funding rates for perpetual pairs."""

import time

from config import PROGRAM_ID, RPC_URL
from solders.pubkey import Pubkey
from solana.rpc.async_api import AsyncClient
from solana.rpc.commitment import Confirmed


async def calc_funding_rate(open_interest_long: int, open_interest_short: int) -> float:
    """Funding rate based on OI imbalance. Positive = longs pay shorts."""
    total_oi = open_interest_long + open_interest_short
    if total_oi == 0:
        return 0.0
    imbalance = (open_interest_long - open_interest_short) / total_oi
    # base rate 0.01% per hour, scaled by imbalance
    return 0.0001 * imbalance


async def run_funding_crank():
    """Funding rate calculation cycle. Logs rates for each pair."""
    program_id = Pubkey.from_string(PROGRAM_ID)
    client = AsyncClient(RPC_URL)

    # FIXME: read pair accounts and parse OI values
    # For now log mock funding rates
    mock_pairs = [
        {"name": "EUR/USD", "oi_long": 5_000_000, "oi_short": 3_200_000},
        {"name": "GBP/USD", "oi_long": 2_100_000, "oi_short": 2_800_000},
    ]

    print(f"[funding] calculating rates at {int(time.time())}...")

    for pair in mock_pairs:
        rate = await calc_funding_rate(pair["oi_long"], pair["oi_short"])
        direction = "longs pay" if rate > 0 else "shorts pay"
        print(f"[funding] {pair['name']}: {abs(rate)*100:.4f}% ({direction})")

    await client.close()
    print("[funding] cycle done")
