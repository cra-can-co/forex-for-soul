import os
from pathlib import Path

_root = Path(__file__).resolve().parent

# Load environment from .env next to this file
_envfile = _root / '.env'
if _envfile.is_file():
    for line in _envfile.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        k, v = line.split('=', 1)
        os.environ.setdefault(k.strip(), v.strip())

RPC_URL = os.getenv("ANCHOR_PROVIDER_URL", "https://api.devnet.solana.com")
PROGRAM_ID = os.getenv("PROGRAM_ID", "ERSbyEx6s4MJnAem1vjmZW8Wv2cQdx1U4Fytuo6qy8ro")
WALLET_PATH = os.getenv("ANCHOR_WALLET", str(Path.home() / ".config/solana/id.json"))
PYTH_ENDPOINT = os.getenv("PYTH_ENDPOINT", "https://hermes.pyth.network")

PRICE_UPDATE_INTERVAL = 10  # seconds
FUNDING_INTERVAL = 3600     # 1 hour
LIQUIDATION_INTERVAL = 30   # seconds
