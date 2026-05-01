# changelog

## v0.5 — phase 5: live perps on devnet

- contract deployed to devnet — `ERSbyEx6s4MJnAem1vjmZW8Wv2cQdx1U4Fytuo6qy8ro`
- wallet adapter wired through Phantom + Solflare
- on-chain open / close position flow end-to-end
- 4 pairs seeded with live prices: EUR/USD, GBP/USD, USD/JPY, XAU/USD
- TradingView Lightweight Charts wired to per-pair price stream
- Pyth feed integration with stale-price guard

## v0.4 — phase 4: program + crank

- anchor program with pair / position / vault state accounts
- liquidator script with bounty payout
- price-push crank pulling from Pyth on a fixed cadence
- funding rate accrual logic, hourly settle

## v0.3 — phase 3: frontend bones

- next.js shell with dark trading-terminal theme
- order panel + leverage dial + sl/tp inputs
- positions table + pnl badge
- ticker rail across the top with all pairs
