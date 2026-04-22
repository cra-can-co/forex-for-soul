'use client';

import { useEffect, useMemo, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { FlipNumber } from './FlipNumber';
import { OrdersDialog } from './OrdersDialog';
import { useExchange } from '../app/lib/useProgram';
import { OpenPosition, closePositionTx, pnlFor } from '../app/lib/positions';
import { useOrders } from '../app/lib/orders';
import { QuoteMap } from '../app/lib/pyth';
import { pointsForRealisedPnl, useHoldStreakAward, usePoints } from '../app/lib/points';
import { friendlyTxError } from '../app/lib/txErrors';

interface Props {
  positions: OpenPosition[];
  quotes: QuoteMap;
  activePair: string | null;
  onSelectPair: (symbol: string) => void;
  onRescan: () => void;
  loading: boolean;
}

export function PositionsPanel({ positions, quotes, activePair, onSelectPair, onRescan, loading }: Props) {
  const { publicKey } = useWallet();
  const { exchange } = useExchange();
  const { orders, setOrders, clearOrders } = useOrders();
  const { award } = usePoints();
  const [closing, setClosing] = useState<string | null>(null);
  const [modifying, setModifying] = useState<OpenPosition | null>(null);
  const [flash, setFlash] = useState<{ kind: 'ok' | 'err'; body: string; sig?: string } | null>(null);

  useHoldStreakAward(positions);

  // Auto-dismiss flash after 6s so success toasts don't stick forever.
  useEffect(() => {
    if (!flash) return;
    const id = setTimeout(() => setFlash(null), 6000);
    return () => clearTimeout(id);
  }, [flash]);

  const aggregate = useMemo(() => {
    if (positions.length === 0) return null;
    let nominal = 0;
    let notional = 0;
    for (const p of positions) {
      const mark = quotes[p.pair]?.price ?? p.entryPrice;
      const r = pnlFor(p, mark);
      nominal += r.nominal;
      notional += p.sizeLamports / 1_000_000;
    }
    return { nominal, notional };
  }, [positions, quotes]);

  async function handleClose(p: OpenPosition) {
    if (!publicKey) return;
    setClosing(p.pubkey);
    setFlash(null);
    try {
      const mark = quotes[p.pair]?.price ?? p.entryPrice;
      const { nominal } = pnlFor(p, mark);
      const sig = await closePositionTx(exchange, publicKey, p);
      clearOrders(p.pubkey);
      const pts = pointsForRealisedPnl(nominal);
      if (pts > 0) award('realised-pnl', pts, { pair: p.pair, pnl: nominal.toFixed(2) });
      // liquidation dodged: closed with entry price > liquidation threshold by >=20%
      const cushion = p.side === 'long' ? (mark - p.liquidationPrice) / p.entryPrice : (p.liquidationPrice - mark) / p.entryPrice;
      if (cushion > 0.05) award('liquidation-dodged', 25, { pair: p.pair });
      setFlash({ kind: 'ok', body: `Sealed ${p.pair} ${p.side === 'long' ? 'Ascend' : 'Descend'} · +${pts} pts`, sig });
      onRescan();
    } catch (exc) {
      setFlash({ kind: 'err', body: friendlyTxError(exc) });
    } finally {
      setClosing(null);
    }
  }

  if (!publicKey) {
    return (
      <div className="border-t border-rule px-6 py-10 text-center text-dim text-sm">
        Connect wallet to reveal your open positions.
      </div>
    );
  }

  return (
    <div className="border-t border-rule">
      {/* Header strip */}
      <div className="px-6 py-4 flex items-center justify-between flex-wrap gap-3 border-b border-rule bg-surface/50">
        <div className="flex items-baseline gap-6">
          <div>
            <div className="eyebrow">Open Positions</div>
            <div className="font-display text-ivory text-xl mt-0.5">
              {positions.length} live {positions.length === 1 ? 'ticket' : 'tickets'}
            </div>
          </div>
          {aggregate && (
            <div className="flex gap-6">
              <MiniStat label="Aggregate P&amp;L" tone={aggregate.nominal >= 0 ? 'ascend' : 'descend'}>
                {aggregate.nominal >= 0 ? '+' : ''}
                {aggregate.nominal.toFixed(2)} USDC
              </MiniStat>
              <MiniStat label="Notional" tone="ivory">
                ${aggregate.notional.toFixed(2)}
              </MiniStat>
            </div>
          )}
        </div>
        <button
          onClick={onRescan}
          className="text-[10px] uppercase tracking-[0.24em] px-3 py-1.5 border border-rule hover:border-brass/40 text-dim hover:text-brass-bright"
        >
          {loading ? 'Scanning…' : 'Rescan'}
        </button>
      </div>

      {flash && (
        <div
          className={`px-6 py-2 text-[11px] uppercase tracking-[0.22em] border-b ${
            flash.kind === 'ok' ? 'text-ascend border-ascend/20 bg-ascend/5' : 'text-descend border-descend/20 bg-descend/5'
          }`}
        >
          {flash.body}
          {flash.sig && (
            <>
              {' '}·{' '}
              <a className="underline" target="_blank" rel="noreferrer" href={`https://explorer.solana.com/tx/${flash.sig}?cluster=devnet`}>
                view tx
              </a>
            </>
          )}
        </div>
      )}

      {positions.length === 0 ? (
        <div className="px-6 py-12 text-center text-dim text-sm">
          — ledger is blank. open a trade above. —
        </div>
      ) : (
        <table className="w-full text-[12px] table-fixed">
          <colgroup>
            <col className="w-[12%]" />
            <col className="w-[11%]" />
            <col className="w-[8%]" />
            <col className="w-[6%]" />
            <col className="w-[10%]" />
            <col className="w-[10%]" />
            <col className="w-[10%] hidden lg:table-column" />
            <col className="w-[8%] hidden xl:table-column" />
            <col className="w-[8%] hidden xl:table-column" />
            <col className="w-[12%]" />
            <col className="w-[13%]" />
          </colgroup>
          <thead>
            <tr className="text-[9px] uppercase tracking-[0.2em] text-dim border-b border-rule">
              <Th align="left">Pair</Th>
              <Th align="left">Side</Th>
              <Th align="right">Size</Th>
              <Th align="right">Lev</Th>
              <Th align="right">Entry</Th>
              <Th align="right">Mark</Th>
              <Th align="right" hiddenClass="hidden lg:table-cell">Liq</Th>
              <Th align="right" hiddenClass="hidden xl:table-cell">SL</Th>
              <Th align="right" hiddenClass="hidden xl:table-cell">TP</Th>
              <Th align="right">P&amp;L</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {positions.map((p) => {
              const mark = quotes[p.pair]?.price ?? p.entryPrice;
              const { pct, nominal } = pnlFor(p, mark);
              const sl = orders[p.pubkey]?.stopLoss ?? null;
              const tp = orders[p.pubkey]?.takeProfit ?? null;
              const isActive = activePair === p.pair;
              const isClosing = closing === p.pubkey;
              return (
                <tr
                  key={p.pubkey}
                  onClick={() => onSelectPair(p.pair)}
                  className={`cursor-pointer border-b border-rule/50 transition-colors ${
                    isActive ? 'bg-brass/5' : 'hover:bg-surface-raised/40'
                  }`}
                >
                  <td className="px-3 py-2.5 font-display text-ivory truncate">
                    {p.pair}
                    {isActive && <span className="ml-1.5 text-[9px] text-brass/80 tracking-[0.2em]">●</span>}
                  </td>
                  <td className={`px-3 py-2.5 font-display italic ${p.side === 'long' ? 'text-ascend' : 'text-descend'}`}>
                    {p.side === 'long' ? '↑ Ascend' : '↓ Descend'}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-ivory">
                    {(p.sizeLamports / 1_000_000).toFixed(2)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-brass">{p.leverage}×</td>
                  <td className="px-3 py-2.5 text-right font-mono text-dim tabular-nums">
                    {p.entryPrice.toFixed(p.pairCfg.precision)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-ivory tabular-nums">
                    <FlipNumber value={mark} precision={p.pairCfg.precision} />
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-descend tabular-nums hidden lg:table-cell">
                    {p.liquidationPrice.toFixed(p.pairCfg.precision)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums hidden xl:table-cell">
                    {sl != null ? (
                      <span className="text-amber-400/90">{sl.toFixed(p.pairCfg.precision)}</span>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums hidden xl:table-cell">
                    {tp != null ? (
                      <span className="text-ascend">{tp.toFixed(p.pairCfg.precision)}</span>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td className={`px-3 py-2.5 text-right font-mono tabular-nums ${nominal >= 0 ? 'text-ascend' : 'text-descend'}`}>
                    {nominal >= 0 ? '+' : ''}
                    {nominal.toFixed(2)}
                    <span className="block text-[9px] text-dim">
                      ({nominal >= 0 ? '+' : ''}
                      {pct.toFixed(1)}%)
                    </span>
                  </td>
                  <td className="px-2 py-2.5 text-right whitespace-nowrap">
                    <button
                      onClick={(e) => { e.stopPropagation(); setModifying(p); }}
                      title="Edit SL / TP"
                      className="text-[10px] tracking-[0.2em] uppercase text-dim hover:text-brass-bright border border-rule hover:border-brass/40 px-1.5 py-1 mr-1"
                    >
                      SL/TP
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleClose(p); }}
                      disabled={isClosing}
                      className="text-[10px] tracking-[0.2em] uppercase text-dim hover:text-descend border border-rule hover:border-descend/60 px-1.5 py-1 disabled:opacity-40"
                    >
                      {isClosing ? '…' : 'Close'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {modifying && (
        <OrdersDialog
          position={modifying}
          currentMark={quotes[modifying.pair]?.price ?? modifying.entryPrice}
          existing={orders[modifying.pubkey]}
          onClose={() => setModifying(null)}
          onSave={(targets) => {
            setOrders(modifying.pubkey, targets);
            setModifying(null);
          }}
          onClear={() => {
            clearOrders(modifying.pubkey);
            setModifying(null);
          }}
        />
      )}
    </div>
  );
}

function Th({ children, align = 'left', hiddenClass }: { children?: React.ReactNode; align?: 'left' | 'right'; hiddenClass?: string }) {
  return <th className={`px-3 py-2.5 font-normal text-${align} ${hiddenClass ?? ''}`}>{children}</th>;
}

function MiniStat({ label, tone, children }: { label: string; tone: 'ivory' | 'ascend' | 'descend'; children: React.ReactNode }) {
  const color = tone === 'ascend' ? 'text-ascend' : tone === 'descend' ? 'text-descend' : 'text-ivory';
  return (
    <div>
      <div className="text-[9px] uppercase tracking-[0.24em] text-dim">{label}</div>
      <div className={`font-display text-lg mt-0.5 ${color}`}>{children}</div>
    </div>
  );
}
