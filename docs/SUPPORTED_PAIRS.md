# Supported pairs

The desk currently lists four FX perpetuals and an experimental gold contract.
Each is wired to its corresponding Pyth Hermes feed and inherits the platform-wide
20× max leverage (subject to risk-based reduction during high vol).

| Pair       | Glyph | Pyth feed (mainnet)                                             | Pip   | Mythos              |
|------------|:-----:|------------------------------------------------------------------|-------|---------------------|
| EUR/USD    |  €$   | `0xa995d00bb36a63cef7fd2c287dc105fc8f3d93779f062f09551b0af3e81ec30b` | 0.0001 | Eurozone vs Dollar |
| GBP/USD    |  £$   | `0x84755269ea5b0e248aae29b1a40b25e3a9d99c9c4eb2eb1d56fe71c46ddc88b1` | 0.0001 | Cable               |
| USD/JPY    |  $¥   | `0xef2c98c804ba503c6a707e38be4dfbb16683775f195b091252bf24693042fd52` | 0.01   | Yen carry          |
| USD/CHF    |  $₣   | `0x4ba75ec637c1cb6dc2e8a35c1a1ca36b169a5b6dc7c5a39fb3a23ce40f527d34` | 0.0001 | Safe-haven swap    |
| XAU/USD ⚡  |  Au$  | `0x765d2ba906dbc32ca17cc11f5310a89e9ee1f6420508c63861f2f8ba4ee34bb2` | 0.01   | Gold (experimental)|

⚡ = experimental — funding interval halved, max leverage capped at 5×.

## Adding a new pair

1. Add a config row to `app/lib/constants.ts` PAIRS_CONFIG with glyph + Pyth ID
2. Seed an initial price via `crank/seed_pair.ts` (writes the on-chain `Market` PDA)
3. Add a TradingView symbol mapping if you want the chart to render historical candles
4. Drop a row in this file and bump the README pair count

## Funding rate decay

Funding accrues at the configured rate (`crank/seed_pair.ts → fundingIntervalSeconds`)
multiplied by `(skew/openInterest)`. Pairs flagged ⚡ pay/charge 2× to discourage
holding overnight while the market is still in beta.

> Risk warning lives in [README.md](../README.md#risk-disclaimer). Don't trade
> what you can't afford to flatten in one bad print.
