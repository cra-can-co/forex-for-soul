# Risk disclaimer

> **Read before trading.** Forex perpetuals are leveraged products and can
> lose more than the initial margin in extreme moves. This document is the
> trader-facing risk policy for forex-for-soul.

## Core risks

### Liquidation
Open a 20× position and a 5% adverse move wipes you out. The exchange does
not maintain a margin call window — the keeper auto-closes once HF ≤ 1.0.

### Funding rate decay
Funding accrues every hour proportional to `(skew/openInterest)`. A
sustained one-sided book (e.g. everyone long EUR/USD) means longs pay shorts
~1–4% per day. Holding overnight against the skew is expensive.

### Oracle outages
We rely on Pyth Hermes for the entire FX surface. If Hermes goes dark the
contract enters *frozen* state — no opens, no closes, no liquidations. Funded
positions accrue as if frozen. **You cannot exit during this window.**

### Slippage on close
Closing a large position against thin liquidity skews the mid by the position
size. We use a TWAP fill internally, but the realized close price can differ
from the displayed mark by 0.05–0.30%.

## Devnet posture

- This is a **devnet-only** deployment. SOL has no value. USDC is a mock mint.
- The contract will not be migrated to mainnet without a third-party audit.
- All disclaimers below apply to the eventual mainnet incarnation.

## What we do *not* guarantee

- 24/7 uptime. The keeper crank is a best-effort process.
- Funding-rate calculation parity with major venues. Our funding is symmetric
  and may differ from Binance/dYdX by up to 30bps/day.
- Specific execution latency on close — funded keeper queue is FIFO.

## Position sizing rules of thumb

| leverage | suggested max margin %  | typical hold time |
|---------:|-------------------------|-------------------|
|     2 ×  | 25%                     | days              |
|     5 ×  | 10%                     | hours             |
|    10 ×  | 5%                      | minutes           |
|    20 ×  | 2%                      | seconds           |

> When in doubt, size down. There is no edge in surviving on stupid leverage.
