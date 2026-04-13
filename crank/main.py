"""Forex for Soul crank runner — price feed, funding rates, liquidation."""

import asyncio
import signal
import sys

from config import PRICE_UPDATE_INTERVAL, FUNDING_INTERVAL, LIQUIDATION_INTERVAL
from price_crank import run_price_crank
from funding_crank import run_funding_crank
from liquidation_bot import run_liquidation_bot


async def periodic(coro_fn, interval_sec: int, label: str):
    """Run a coroutine periodically."""
    while True:
        try:
            await coro_fn()
        except Exception as exc:
            print(f"[{label}] error: {exc}")
        await asyncio.sleep(interval_sec)


async def run():
    print(f"forex crank live | price: {PRICE_UPDATE_INTERVAL}s | "
          f"funding: {FUNDING_INTERVAL}s | liquidation: {LIQUIDATION_INTERVAL}s")

    # initial run
    await run_price_crank()
    await run_funding_crank()
    await run_liquidation_bot()

    # schedule periodic tasks
    await asyncio.gather(
        periodic(run_price_crank, PRICE_UPDATE_INTERVAL, "price"),
        periodic(run_funding_crank, FUNDING_INTERVAL, "funding"),
        periodic(run_liquidation_bot, LIQUIDATION_INTERVAL, "liquidation"),
    )


def main():
    def shutdown(sig, frame):
        print("\nshutting down...")
        sys.exit(0)

    signal.signal(signal.SIGINT, shutdown)
    signal.signal(signal.SIGTERM, shutdown)

    asyncio.run(run())


if __name__ == "__main__":
    main()
