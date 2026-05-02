# Margin rules

How initial margin, maintenance margin, and liquidation are computed on the
forex-for-soul desk.

## Definitions

| term                  | symbol  | meaning                                                  |
|-----------------------|---------|----------------------------------------------------------|
| initial margin        | IM      | USDC required to open a position, IM = notional / lev    |
| maintenance margin    | MM      | minimum margin to keep position open                     |
| margin balance        | MB      | IM + unrealized PnL                                      |
| margin ratio          | MR      | MB / MM                                                  |
| funding payment       | F       | hourly accrual proportional to skew/openInterest         |
| mark price            | MK      | TWAP from Pyth Hermes over last 60s                       |

## Open

```
notional = size × markPrice
IM       = notional / leverage          // user-chosen leverage 1×–20×
fee_open = notional × 0.0006            // 6 bps
```

The `IM + fee_open` USDC must be present in margin account.

## Maintenance

```
MM = notional × maintenance_margin_pct
```

`maintenance_margin_pct` is per-pair, currently:

| pair      | mm_pct |
|-----------|--------|
| EUR/USD   | 0.50%  |
| GBP/USD   | 0.55%  |
| USD/JPY   | 0.55%  |
| USD/CHF   | 0.60%  |
| XAU/USD   | 1.50%  |  ← experimental, higher buffer

## Funding

Accrued every hour at top of UTC hour.

```
F_per_hour = notional × max(-0.05%, min(0.05%, fundingRateBaseline + skewAdj))
```

Longs pay shorts when funding > 0; shorts pay longs when < 0.

`skewAdj = (longOI - shortOI) / openInterest × 0.001`

## Liquidation

Triggered when `MR < 1.0`. The keeper closes at `markPrice ± slippageMax`,
returns leftover margin minus the close fee.

```
slippageMax = 0.30%      // 3rd-party AMMs
fee_close   = notional × 0.0008
```

Insurance pool covers shortfalls when slippage exceeds available margin.

## Edge cases

- **Frozen oracle** (Hermes ≥ 60s stale) → no opens, no closes, no liqs;
  positions accrue funding as usual until oracle returns.
- **Funding rate cap** ±5 bps/hour ⇒ ±120 bps/day even in extreme skew.
- **Daily reset** on funding rate average happens 00:00 UTC.

## See also

- [Risk disclaimer](./RISK_DISCLAIMER.md)
- [Supported pairs](./SUPPORTED_PAIRS.md)
