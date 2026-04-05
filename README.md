# Forex for Soul

Decentralized Forex perpetual contracts on Solana. Trade major currency pairs with up to 20x leverage, settled instantly on-chain.

## Supported Pairs

| Pair | Oracle | Status |
|------|--------|--------|
| EUR/USD | Pyth | Planned |
| GBP/USD | Pyth | Planned |
| USD/JPY | Pyth | Planned |

## Core Action

Open long/short position on EUR/USD → set leverage (1-20x) → monitor P&L → close position.

## How It Differs

Unlike centralized forex brokers, Forex for Soul:
- Fully non-custodial — your margin stays in your wallet until trade execution
- Transparent funding rates calculated from on-chain order flow
- Pyth oracle price feeds — no dealer manipulation
- Instant settlement

## Tech Stack

- **Contracts**: Anchor (Rust) — position management, liquidation engine
- **Frontend**: Next.js + TradingView Lightweight Charts
- **Crank**: Python — funding rate calc, liquidation bot
- **Oracle**: Pyth Network

## Development

```bash
anchor build && anchor deploy
cd crank && pip install -r requirements.txt && python main.py
cd web && npm install && npm run dev
```

## Risk Warning

Trading perpetual contracts involves significant risk of loss. This is experimental software on devnet. Do not use real funds.

## License

MIT
