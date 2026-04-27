# Forex for Soul

Decentralised Forex perpetuals on Solana, settled on-chain against live Pyth oracle prints.

Trade EUR/USD, GBP/USD, USD/JPY, and AUD/USD with up to 20× leverage. Positions open and close on devnet; price feed is cranked from Pyth Hermes every ~8s. Chart, SL/TP overlays, auto-executor, market-hours banner, and a points ledger are all wired client-side.

## What runs where

| Piece | Tech | Where |
|---|---|---|
| Program | Anchor / Rust | `programs/forexforsoul/src/` — deployed on devnet as `ERSbyEx6s4MJnAem1vjmZW8Wv2cQdx1U4Fytuo6qy8ro` |
| Frontend | Next 14 + React 18 + Tailwind | `app/` — dev on `:3003` |
| Chart | `lightweight-charts` + Pyth Benchmarks TV shim | `app/components/ChartDesk.tsx` |
| Quotes | Pyth Hermes v2 (REST poll) | `app/app/lib/pyth.ts` |
| On-chain crank | TypeScript / ts-node | `scripts/push-prices.ts` |
| Market clock | `Intl.DateTimeFormat` anchored to NY 17:00 | `app/app/lib/marketHours.ts` |

The old Python crank directory (`crank/`) was removed — its discriminator was stale and it never actually hit chain. The single source of truth for the oracle crank is `scripts/push-prices.ts`.

## Features

- **Night Desk** editorial UI — ivory-on-obsidian with brass accents, Fraunces display + JetBrains Mono.
- **Real FX candles** from Pyth Benchmarks (1m / 5m / 15m / 1h / 4h / 1D).
- **Live tick overlay** on the active candle, merged from Pyth Hermes.
- **On-chart price lines** — Entry, Liquidation, Stop Loss, Take Profit — updated whenever positions or orders change.
- **TA toolkit** — SMA(20), EMA(50), click-to-drop alert lines.
- **Leverage dial** 1×–20× with brass arc + preset chips.
- **Ascend / Descend** (Long / Short) trade panel with size presets and %-of-equity SL/TP fields.
- **Open Positions table** under the chart, live P&L vs Pyth mark, Close / SL-TP controls.
- **Auto-executor** — client-side watcher that fires `close_position` when SL/TP thresholds are crossed while the market is open.
- **Market clock** banner — OPEN / CLOSED with DST-aware countdown, timezone selector (Local / UTC / Sydney / Tokyo / London / NY).
- **Points chronicle** (`/points`) — cosmetic rewards for opens, holds, realised profit, liquidation-dodged, deep leverage, big size, vault deposit, daily visit. Cumulative area chart + breakdown bars.
- **Error boundaries** on chart, trade desk, positions panel.

## Running locally

```bash
# One-off: fund the deploy keypair and seed 4 pairs on devnet
npm install
npx ts-node scripts/init-devnet.ts

# Oracle crank — leave running in the background
npx ts-node scripts/push-prices.ts

# Frontend
cd app && npm install && npm run dev
# → http://localhost:3003
```

Connect Phantom / Solflare on devnet, request an airdrop if the wallet is empty, and pick a pair.

## Scope caveats

- **No real USDC flow.** Collateral is recorded on-chain but positions settle in SOL lamports rather than an SPL USDC vault. The economic numbers in the UI are shown in USDC notional for familiarity; see `state/position.rs` for the raw unit model. Wiring SPL transfers is a future upgrade.
- **Admin-pushed oracle.** The program accepts prices from a single authority (the deploy keypair), fed by our crank from Pyth Hermes. Production would verify the Pyth account directly.
- **Liquidation.** `liquidate_position` is permissionless on-chain and can be called by any signer; the auto-executor intentionally handles only user-intent orders (SL/TP).
- **Points are cosmetic.** Stored in `localStorage` per-wallet — survive reload, not shared across devices.

## File map

```
programs/forexforsoul/   Anchor program (8 instructions)
scripts/                 init-devnet.ts, push-prices.ts (oracle crank)
app/app/                 Next App Router pages (Desk, Ledger, Vault, Points)
app/app/lib/             pyth, positions, orders, autoExecutor, marketHours, points, txErrors
app/components/          ChartDesk, FlipNumber, LeverageDial, MarketClock,
                         OrdersDialog, PairRail, PositionsPanel, TickerTape,
                         TradeDesk, TickerTape, Boundary
tests/                   no unit tests — devnet E2E only
```

## License

MIT.
