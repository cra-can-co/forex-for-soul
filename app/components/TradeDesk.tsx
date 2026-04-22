'use client';

import { useMemo, useState } from 'react';
import { PublicKey, SystemProgram } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';
import { useWallet } from '@solana/wallet-adapter-react';
import { LeverageDial } from './LeverageDial';
import { FlipNumber } from './FlipNumber';
import { useExchange, getExchangePDA, getPoolPDA, getPositionPDA, getUserUsdcAta, getVaultAta } from '../app/lib/useProgram';
import { useOrders } from '../app/lib/orders';
import { pointsForOpen, usePoints } from '../app/lib/points';
import { friendlyTxError } from '../app/lib/txErrors';
import { claimFaucet, useUsdcBalance, USDC_MINT } from '../app/lib/usdc';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';

type Side = 'ascend' | 'descend';
type TxState = 'idle' | 'building' | 'signing' | 'done' | 'error';

interface Props {
  pair: {
    base: string;
    quote: string;
    pda: PublicKey;
    price: number;
    precision: number;
    isActive: boolean;
  };
  marketOpen: boolean;
  onOpened?: () => void;
}

export function TradeDesk({ pair, marketOpen, onOpened }: Props) {
  const { publicKey } = useWallet();
  const { exchange, canSign } = useExchange();
  const { setOrders } = useOrders();
  const { award } = usePoints();
  const { balance: usdcBalance, refresh: refreshUsdc } = useUsdcBalance();
  const [claiming, setClaiming] = useState(false);
  const [faucetFlash, setFaucetFlash] = useState<string | null>(null);

  async function claim() {
    if (!publicKey) return;
    setClaiming(true);
    setFaucetFlash(null);
    const res = await claimFaucet(publicKey.toBase58());
    if (res.error) setFaucetFlash(`Faucet error: ${res.error}`);
    else setFaucetFlash(`+${res.amount ?? 0} mUSDC claimed ✓`);
    await refreshUsdc();
    setClaiming(false);
    setTimeout(() => setFaucetFlash(null), 5000);
  }

  const [side, setSide] = useState<Side>('ascend');
  const [leverage, setLeverage] = useState(5);
  const [size, setSize] = useState('100');
  const [slPct, setSlPct] = useState<string>(''); // % move vs entry at current leverage
  const [tpPct, setTpPct] = useState<string>('');
  const [txState, setTxState] = useState<TxState>('idle');
  const [txError, setTxError] = useState('');
  const [txSig, setTxSig] = useState('');

  const sizeNum = parseFloat(size) || 0;
  const collateralSol = sizeNum > 0 ? sizeNum / leverage / 1000 : 0;
  // Mirrors the on-chain formula from open_position.rs:
  //   price_buffer (human) = (collateral - maintenance) * 1e8 / size
  //                        = (1/leverage - MAINTENANCE_MARGIN_BPS/BPS_DENOMINATOR)
  // Maintenance margin is fixed at 100 bps (1%) in constants.rs.
  const priceBuffer = Math.max(0, 1 / leverage - 0.01);
  const liqPrice =
    side === 'ascend'
      ? Math.max(0, pair.price - priceBuffer)
      : pair.price + priceBuffer;
  const feeEst = sizeNum * 0.0006;

  // Derive absolute SL / TP prices from % inputs (% measured on leveraged equity)
  const slAbs = useMemo(() => computeAbsolute(side, pair.price, leverage, slPct, 'sl'), [side, pair.price, leverage, slPct]);
  const tpAbs = useMemo(() => computeAbsolute(side, pair.price, leverage, tpPct, 'tp'), [side, pair.price, leverage, tpPct]);

  const neededUsdc = sizeNum > 0 ? (sizeNum / leverage) * 1.01 : 0; // rough: collateral + 1% headroom for fee
  const balanceOk = usdcBalance == null ? true : usdcBalance >= neededUsdc;
  const canTrade =
    !!publicKey &&
    pair.isActive &&
    sizeNum > 0 &&
    canSign &&
    marketOpen &&
    balanceOk &&
    txState !== 'building' &&
    txState !== 'signing';

  async function submit() {
    if (!canTrade || !publicKey) return;
    setTxState('building');
    setTxError('');
    setTxSig('');
    try {
      const positionId = Date.now();
      // Contract requires strict equality `size == collateral * leverage`. To
      // avoid rounding mismatches we compute collateral from the user's
      // typed notional and then recompute size from it, which pulls both
      // numbers onto the same integer grid.
      const requested = Math.floor(sizeNum * 1_000_000);
      const collateralVal = Math.floor(requested / leverage);
      const sizeVal = collateralVal * leverage;
      if (collateralVal <= 0 || sizeVal <= 0) {
        setTxState('error');
        setTxError('Notional too small for this leverage.');
        return;
      }
      const sideArg = side === 'ascend' ? { long: {} } : { short: {} };

      const positionPda = getPositionPDA(publicKey, pair.pda, positionId);

      setTxState('signing');
      const tx = await (exchange.methods as any)
        .openPosition(
          new BN(positionId),
          sideArg,
          new BN(sizeVal),
          new BN(collateralVal),
          leverage,
        )
        .accountsPartial({
          exchange: getExchangePDA(),
          pair: pair.pda,
          pool: getPoolPDA(),
          position: positionPda,
          userUsdc: getUserUsdcAta(publicKey),
          vault: getVaultAta(),
          trader: publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      // Persist SL/TP client-side keyed by the deterministic position PDA
      if (slAbs != null || tpAbs != null) {
        setOrders(positionPda.toBase58(), { stopLoss: slAbs, takeProfit: tpAbs });
      }

      // Award points
      const pts = pointsForOpen(sizeNum, leverage);
      if (pts.base > 0) award('open-position', pts.base, { pair: `${pair.base}/${pair.quote}`, size: sizeNum, leverage });
      if (pts.bigSize > 0) award('big-size', pts.bigSize, { size: sizeNum });
      if (pts.deepLev > 0) award('deep-leverage', pts.deepLev, { leverage });

      setTxSig(tx);
      setTxState('done');
      refreshUsdc();
      onOpened?.();
    } catch (exc) {
      setTxState('error');
      setTxError(friendlyTxError(exc));
    }
  }

  return (
    <aside className="card-brass relative h-full flex flex-col">
      <div className="border-b border-rule px-5 pt-5 pb-3">
        <div className="eyebrow">Trade Desk ✦ Devnet</div>
        <div className="mt-2 flex items-baseline justify-between">
          <span className="font-display text-ivory text-xl">
            {pair.base}<span className="text-brass/60">/</span>{pair.quote}
          </span>
          <span className="font-mono text-brass-bright text-lg">
            <FlipNumber value={pair.price} precision={pair.precision} />
          </span>
        </div>
        <div className="mt-1 text-[10px] text-dim tracking-widest uppercase">
          oracle pyth hermes · cranked to chain
        </div>
      </div>

      <div className="grid grid-cols-2 gap-px bg-rule border-b border-rule">
        <button
          onClick={() => setSide('ascend')}
          className={`py-4 text-center transition-colors ${side === 'ascend' ? 'bg-ascend/10' : 'bg-surface hover:bg-surface-raised'}`}
        >
          <div className={`font-display text-lg ${side === 'ascend' ? 'text-ascend' : 'text-dim'}`}>↑ Ascend</div>
          <div className={`text-[9px] tracking-[0.28em] uppercase ${side === 'ascend' ? 'text-ascend/80' : 'text-muted'}`}>Long Position</div>
        </button>
        <button
          onClick={() => setSide('descend')}
          className={`py-4 text-center transition-colors ${side === 'descend' ? 'bg-descend/10' : 'bg-surface hover:bg-surface-raised'}`}
        >
          <div className={`font-display text-lg ${side === 'descend' ? 'text-descend' : 'text-dim'}`}>↓ Descend</div>
          <div className={`text-[9px] tracking-[0.28em] uppercase ${side === 'descend' ? 'text-descend/80' : 'text-muted'}`}>Short Position</div>
        </button>
      </div>

      <div className="px-5 py-5 flex-1 flex flex-col gap-5 overflow-y-auto">
        {/* USDC balance + faucet */}
        {publicKey && (
          <div className="flex items-center justify-between border border-rule px-3 py-2">
            <div>
              <div className="text-[10px] tracking-[0.24em] uppercase text-dim">mUSDC Balance</div>
              <div className="font-mono text-ivory">
                {usdcBalance == null ? '—' : usdcBalance.toFixed(2)}
                <span className="text-dim text-[11px] ml-1">mock</span>
              </div>
            </div>
            <button
              onClick={claim}
              disabled={claiming}
              className="text-[10px] uppercase tracking-[0.22em] border border-brass/50 text-brass-bright hover:bg-brass/10 px-3 py-1.5 disabled:opacity-40"
            >
              {claiming ? 'Minting…' : 'Faucet 10k'}
            </button>
          </div>
        )}
        {faucetFlash && (
          <div className="text-[11px] text-brass-bright border border-brass/30 bg-brass/5 px-3 py-2 tracking-wider uppercase text-center">
            {faucetFlash}
          </div>
        )}

        <label className="block">
          <div className="text-[10px] tracking-[0.24em] uppercase text-dim mb-1.5">Notional (USDC)</div>
          <input
            value={size}
            onChange={(e) => setSize(e.target.value)}
            type="number"
            className="w-full bg-surface border border-rule px-3 py-2.5 font-mono text-ivory outline-none focus:border-brass"
          />
        </label>

        <div className="flex justify-center pt-1">
          <LeverageDial value={leverage} onChange={setLeverage} />
        </div>

        {/* SL / TP percent inputs */}
        <div className="grid grid-cols-2 gap-3 border-t border-rule pt-4">
          <PercentField
            label="Stop Loss"
            value={slPct}
            onChange={setSlPct}
            presets={['5', '10', '25']}
            hintAbs={slAbs}
            precision={pair.precision}
            tone="amber"
          />
          <PercentField
            label="Take Profit"
            value={tpPct}
            onChange={setTpPct}
            presets={['10', '25', '50']}
            hintAbs={tpAbs}
            precision={pair.precision}
            tone="ascend"
          />
        </div>

        <div className="space-y-2 text-xs border-t border-rule pt-4">
          <Row label="Mark Price" value={pair.price.toFixed(pair.precision)} tone="ivory" />
          <Row label="Liquidation" value={liqPrice.toFixed(pair.precision)} tone="descend" />
          <Row label="Collateral" value={`${collateralSol.toFixed(4)} SOL`} tone="ivory" />
          <Row label="Est. Fee" value={`${feeEst.toFixed(2)} USDC`} tone="dim" />
        </div>

        <button
          onClick={submit}
          disabled={!canTrade}
          className={`mt-auto relative py-3.5 font-display italic text-lg tracking-wide border transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
            side === 'ascend' ? 'border-ascend/60 text-ascend hover:bg-ascend/10' : 'border-descend/60 text-descend hover:bg-descend/10'
          }`}
        >
          {txState === 'building' && 'Composing…'}
          {txState === 'signing' && 'Awaiting Signature…'}
          {txState === 'idle' && (side === 'ascend' ? 'Commit Ascent' : 'Commit Descent')}
          {txState === 'done' && 'Committed ✓'}
          {txState === 'error' && 'Retry'}
        </button>

        {!publicKey && (
          <div className="text-[11px] text-brass/80 border border-brass/30 px-3 py-2 text-center tracking-wider uppercase">
            Connect wallet to trade on devnet
          </div>
        )}
        {publicKey && !pair.isActive && (
          <div className="text-[11px] text-descend border border-descend/30 px-3 py-2 text-center tracking-wider uppercase">
            Pair not initialised on-chain
          </div>
        )}
        {publicKey && pair.isActive && !marketOpen && (
          <div className="text-[11px] text-descend border border-descend/30 px-3 py-2 text-center tracking-wider uppercase">
            FX Markets Closed · see banner for reopen time
          </div>
        )}
        {publicKey && pair.isActive && !balanceOk && usdcBalance != null && (
          <div className="text-[11px] text-descend border border-descend/30 px-3 py-2 text-center tracking-wider uppercase">
            mUSDC insufficient ({usdcBalance.toFixed(2)} of {neededUsdc.toFixed(2)} needed) — claim from faucet above
          </div>
        )}
        {txState === 'done' && txSig && (
          <a href={`https://explorer.solana.com/tx/${txSig}?cluster=devnet`} target="_blank" rel="noreferrer" className="text-[11px] text-ascend underline text-center">
            view transaction ↗
          </a>
        )}
        {txState === 'error' && txError && (
          <div className="text-[11px] text-descend text-center">{txError}</div>
        )}
      </div>
    </aside>
  );
}

function computeAbsolute(side: 'ascend' | 'descend', mark: number, leverage: number, pctStr: string, kind: 'sl' | 'tp'): number | null {
  if (!pctStr || pctStr.trim() === '') return null;
  const pct = Number(pctStr);
  if (!Number.isFinite(pct) || pct <= 0) return null;
  // pct represents account-level % move (i.e. accounting for leverage).
  // Underlying price move = pct / leverage.
  const priceMove = pct / leverage / 100;
  if (side === 'ascend') {
    return kind === 'sl' ? mark * (1 - priceMove) : mark * (1 + priceMove);
  }
  return kind === 'sl' ? mark * (1 + priceMove) : mark * (1 - priceMove);
}

function PercentField({
  label, value, onChange, presets, hintAbs, precision, tone,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  presets: string[];
  hintAbs: number | null;
  precision: number;
  tone: 'amber' | 'ascend';
}) {
  const ring = tone === 'amber' ? 'focus-within:border-amber-400/70' : 'focus-within:border-ascend/70';
  const badge = tone === 'amber' ? 'text-amber-400/90' : 'text-ascend';
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] tracking-[0.24em] uppercase text-dim">
          {label}
          <span className="text-muted normal-case tracking-normal ml-1">· % of equity</span>
        </span>
        <span className={`font-mono text-[10px] ${badge}`}>
          {hintAbs != null ? `fires @ ${hintAbs.toFixed(precision)}` : '—'}
        </span>
      </div>
      <div className={`flex items-center bg-surface border border-rule ${ring} transition-colors`}>
        <input
          type="number"
          step="any"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="e.g. 10"
          className="flex-1 min-w-0 bg-transparent outline-none px-2.5 py-2 font-mono text-ivory text-sm"
        />
        <span className="pr-2 text-muted text-[10px] font-mono">%</span>
      </div>
      <div className="mt-1 flex gap-1">
        {presets.map((p) => (
          <button
            key={p}
            onClick={() => onChange(p)}
            className="font-mono text-[9px] text-dim hover:text-ivory border border-rule hover:border-brass/40 px-1.5 py-0.5"
          >
            {p}%
          </button>
        ))}
      </div>
    </div>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone: 'ivory' | 'dim' | 'descend' }) {
  const color = tone === 'descend' ? 'text-descend' : tone === 'dim' ? 'text-dim' : 'text-ivory';
  return (
    <div className="flex items-center justify-between">
      <span className="text-dim tracking-widest text-[10px] uppercase">{label}</span>
      <span className={`font-mono ${color}`}>{value}</span>
    </div>
  );
}
