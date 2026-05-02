# contributing — forex-for-soul

a quick map of the desk + how to contribute without breaking trades.

## layout

```
.
├── programs/         anchor — perp engine, market PDAs, position state
├── crank/            python — pyth feeds + funding accrual + liquidator
├── app/              next.js — terminal-style desk + tradingview charts
└── docs/             pairs registry, margin rules, risk disclaimer
```

## local dev

```bash
# Anchor
cd programs/forex_for_soul
anchor build && anchor test

# Crank
cd crank
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python pyth_feeds.py --once

# App
cd app
npm i && npm run dev
```

## commit style — trading jargon

short, lowercase, jargon-flavored:

```
EUR/USD pair live
leverage slider + margin calc
funding rate decay tightened
liquidator: drop slippage cap to 30bps
docs: margin rules + per-pair maintenance pct
```

## pull requests

1. one logical change per PR
2. attach a screenshot for any UI tweak
3. for crank changes, include a 12h dry-run output to prove no funding-rate drift
4. label trade-impacting PRs `risk:high` so they get a second reviewer

## adding a new pair

end-to-end checklist:

1. add row to `app/lib/constants.ts` PAIRS_CONFIG
2. drop pyth feed id into `crank/feeds.toml`
3. seed PDA: `python crank/seed_pair.py --symbol XYZ/USD`
4. update `docs/SUPPORTED_PAIRS.md` + `docs/MARGIN_RULES.md`
5. bump landing pair count

## risk disclaimer

this is **devnet-only**. nothing here trades real money. before any
mainnet posture we need: a third-party audit, an insurance fund, and a
keeper redundancy plan.
