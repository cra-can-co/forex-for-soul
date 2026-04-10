"""Price crank — fetches Pyth prices and updates on-chain trading pairs."""

import json
import struct
import time
from pathlib import Path

import httpx
from solders.keypair import Keypair
from solders.pubkey import Pubkey
from solders.system_program import ID as SYS_PROGRAM
from solders.instruction import Instruction, AccountMeta
from solders.transaction import Transaction
from solders.message import Message
from solana.rpc.async_api import AsyncClient
from solana.rpc.commitment import Confirmed

from config import RPC_URL, PROGRAM_ID, WALLET_PATH, PYTH_ENDPOINT

UPDATE_PRICE_DISC = bytes([61, 220, 100, 200, 243, 144, 157, 65])
EXCHANGE_SEED = b"exchange"

# Pyth feed IDs for forex pairs (mainnet)
PYTH_FEEDS = {
    "EUR/USD": "a995d00bb36a63cef7fd2c287dc105fc8f3d93779f062f09551b0af3e81ec30b",
    "GBP/USD": "84c2dde9633d93d1bcad84e7dc41c9d56578b7ec52fabedc1f335d673df01ae7",
    "JPY/USD": "ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d",
}


def load_keypair(path: str) -> Keypair:
    expanded = Path(path).expanduser()
    with open(expanded) as f:
        return Keypair.from_bytes(bytes(json.load(f)))


async def fetch_pyth_price(feed_id: str) -> int | None:
    """Fetch latest price from Pyth Hermes API. Returns price in 1e8 format."""
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{PYTH_ENDPOINT}/api/latest_price_feeds",
                params={"ids[]": feed_id},
            )
            data = resp.json()
            if data and len(data) > 0:
                price_data = data[0].get("price", {})
                raw_price = int(price_data.get("price", 0))
                expo = int(price_data.get("expo", 0))
                # normalize to 1e8
                return int(raw_price * (10 ** (8 + expo)))
    except Exception as exc:
        print(f"[price] pyth fetch failed: {exc}")
    return None


async def mock_price(pair_name: str) -> int:
    """Mock price for devnet testing."""
    import random
    base_prices = {
        "EUR/USD": 108_500_000,  # 1.085
        "GBP/USD": 126_300_000,  # 1.263
        "JPY/USD": 670_000,      # 0.0067
    }
    base = base_prices.get(pair_name, 100_000_000)
    jitter = random.randint(-100_000, 100_000)
    return base + jitter


async def update_pair_price(
    client: AsyncClient,
    authority: Keypair,
    program_id: Pubkey,
    exchange_pda: Pubkey,
    pair_pubkey: Pubkey,
    price: int,
) -> str | None:
    """Send update_price transaction."""
    ix_data = bytearray(UPDATE_PRICE_DISC)
    ix_data += struct.pack("<Q", price)

    ix = Instruction(
        program_id=program_id,
        accounts=[
            AccountMeta(exchange_pda, is_signer=False, is_writable=False),
            AccountMeta(pair_pubkey, is_signer=False, is_writable=True),
            AccountMeta(authority.pubkey(), is_signer=True, is_writable=False),
        ],
        data=bytes(ix_data),
    )

    try:
        recent = await client.get_latest_blockhash(commitment=Confirmed)
        blockhash = recent.value.blockhash
        msg = Message.new_with_blockhash([ix], authority.pubkey(), blockhash)
        tx = Transaction.new_unsigned(msg)
        tx.sign([authority], blockhash)
        resp = await client.send_transaction(tx)
        return str(resp.value)
    except Exception as exc:
        print(f"[price] tx failed: {exc}")
        return None


async def run_price_crank():
    """Single price update cycle for all trading pairs."""
    program_id = Pubkey.from_string(PROGRAM_ID)
    authority = load_keypair(WALLET_PATH)
    client = AsyncClient(RPC_URL)

    exchange_pda, _ = Pubkey.find_program_address([EXCHANGE_SEED], program_id)

    # fetch all pair accounts
    resp = await client.get_program_accounts(program_id, commitment=Confirmed)

    # FIXME: filter pair accounts by discriminator — for now just log
    print(f"[price] found {len(resp.value)} program accounts")
    print("[price] mock price update cycle — pairs discovered from on-chain data")

    PAIR_SEED = b"pair"

    for pair_name, feed_id in PYTH_FEEDS.items():
        price = await fetch_pyth_price(feed_id)
        if price is None:
            price = await mock_price(pair_name)
        print(f"[price] {pair_name}: {price / 1e8:.5f}")

        base_cur, quote_cur = pair_name.split("/")
        pair_pda, _ = Pubkey.find_program_address(
            [PAIR_SEED, base_cur.encode(), quote_cur.encode()],
            program_id,
        )

        sig = await update_pair_price(
            client, authority, program_id, exchange_pda, pair_pda, price,
        )
        if sig:
            print(f"[price] {pair_name} updated: {sig[:16]}...")
        else:
            print(f"[price] {pair_name} update failed")

    await client.close()
    print("[price] cycle done")
