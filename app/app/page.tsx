'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { PublicKey } from '@solana/web3.js';
import { useExchange, getPairPDA } from './lib/useProgram';
import { PAIRS_CONFIG, PRICE_DECIMALS } from './lib/constants';
import { usePyth24hBaseline, usePythQuotes } from './lib/pyth';
import { useMarketStatus } from './lib/marketHours';
import { MarketClock } from '../components/MarketClock';
import { usePositions } from './lib/positions';
import { useOrders } from './lib/orders';
import { useAutoExecutor, AutoEvent } from './lib/autoExecutor';
import { TickerTape } from '../components/TickerTape';
import { PairRail } from '../components/PairRail';
import { ChartDesk, ChartLine } from '../components/ChartDesk';
import { FlipNumber } from '../components/FlipNumber';
import { TradeDesk } from '../components/TradeDesk';
import { PositionsPanel } from '../components/PositionsPanel';
import { Boundary } from '../components/Boundary';

interface PairOnChain {
  isActive: boolean;
  rawPrice: number;
  pda: PublicKey;
  spreadPips: number;
}

export default function Desk() {
  const { exchange } = useExchange();
  const { quotes, lastAt, error: pythError } = usePythQuotes(3000);
  const { baseline } = usePyth24hBaseline();
  const market = useMarketStatus(1000);
  const { positions, loading: positionsLoading, rescan: rescanPositions } = usePositions(5000);
  const { orders, clearOrders } = useOrders();

  const [activeIdx, setActiveIdx] = useState(0);
  const [chain, setChain] = useState<PairOnChain[]>(
    PAIRS_CONFIG.map((cfg) => ({ isActive: false, rawPrice: 0, pda: getPairPDA(cfg.base, cfg.quote), spreadPips: 1.0 })),
  );
  const [autoEvents, setAutoEvents] = useState<AutoEvent[]>([]);

  const fetchChain = useCallback(async () => {
    if (!exchange) return;
    const next: PairOnChain[] = [];
    for (const cfg of PAIRS_CONFIG) {
      const pda = getPairPDA(cfg.base, cfg.quote);
      try {
        const acc = await (exchange.account as any).tradingPair.fetch(pda);
        next.push({
          isActive: acc.isActive,
          rawPrice: Number(acc.lastPrice),
          pda,
          spreadPips: Number(acc.spreadBps) / 10,
        });
      } catch {
        next.push({ isActive: false, rawPrice: 0, pda, spreadPips: 1.0 });
      }
    }
    setChain(next);
  }, [exchange]);

  useEffect(() => { fetchChain(); }, [fetchChain]);

  const activeCfg = PAIRS_CONFIG[activeIdx];
  const activeKey = `${activeCfg.base}/${activeCfg.quote}`;
  const livePrice = quotes[activeKey]?.price ?? activeCfg.displayPrice;
  const activeChain = chain[activeIdx];
  const onChainActive = useMemo(() => chain.map((c) => c.isActive), [chain]);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const quotedAgo = lastAt ? Math.max(0, Math.floor((now - lastAt) / 1000)) : null;

  const dayDelta = useMemo(() => {
    const price = quotes[activeKey]?.price;
    const base = baseline[activeKey];
    if (!price || !base) return { pct: 0, dir: 'flat' as const, ready: false };
    const pct = ((price - base) / base) * 100;
    return { pct, dir: pct > 0 ? ('up' as const) : pct < 0 ? ('down' as const) : ('flat' as const), ready: true };
  }, [quotes, baseline, activeKey]);

  // Chart price lines for the focused pair.
  const chartLines: ChartLine[] = useMemo(() => {
    const out: ChartLine[] = [];
    for (const p of positions) {
      if (p.pair !== activeKey) continue;
      out.push({
        id: `${p.pubkey}:entry`,
        price: p.entryPrice,
        color: '#f6f1e7',
        title: `Entry · ${p.side === 'long' ? '↑' : '↓'}`,
        style: 'solid',
      });
      out.push({
        id: `${p.pubkey}:liq`,
        price: p.liquidationPrice,
        color: '#c45a4f',
        title: 'Liquidation',
        style: 'dashed',
      });
      const t = orders[p.pubkey];
      if (t?.stopLoss != null) {
        out.push({
          id: `${p.pubkey}:sl`,
          price: t.stopLoss,
          color: '#f59e0b',
          title: 'Stop Loss',
          style: 'dotted',
        });
      }
      if (t?.takeProfit != null) {
        out.push({
          id: `${p.pubkey}:tp`,
          price: t.takeProfit,
          color: '#9ab973',
          title: 'Take Profit',
          style: 'dotted',
        });
      }
    }
    return out;
  }, [positions, orders, activeKey]);

  // Auto executor
  useAutoExecutor(
    positions,
    quotes,
    orders,
    market.isOpen,
    useCallback((ev: AutoEvent) => {
      setAutoEvents((list) => [ev, ...list].slice(0, 6));
      if (ev.sig) {
        clearOrders(ev.pubkey);
        rescanPositions();
      }
    }, [clearOrders, rescanPositions]),
    useCallback((_pubkey: string) => {
      // hook already cleans up
    }, []),
  );

  const onSelectPair = useCallback((symbol: string) => {
    const i = PAIRS_CONFIG.findIndex((c) => `${c.base}/${c.quote}` === symbol);
    if (i >= 0) setActiveIdx(i);
  }, []);

  return (
    <div className="relative z-10">
      <TickerTape quotes={quotes} baseline={baseline} />

      <section className="px-6 pt-4">
        <MarketClock />
      </section>

      <section className="px-6 pt-6 pb-4">
        <div className="eyebrow">The Night Desk ✦ Vol. I</div>
        <h1 className="font-display text-ivory mt-2 text-[36px] leading-[1.05] tracking-tight max-w-4xl">
          Trade currencies by <em className="text-brass-bright font-display italic">candlelight</em>.
          <span className="block text-dim text-base font-ui font-light mt-2 tracking-normal max-w-2xl">
            Real Pyth quotes · TradingView candles · Devnet-settled perps · On-chart protective orders.
          </span>
        </h1>
        <div className="mt-3 flex items-center gap-5 text-[10px] uppercase tracking-[0.26em] text-dim">
          <span>{quotedAgo == null ? 'warming up…' : `Quoted ${quotedAgo}s ago`}</span>
          <span className="w-px h-3 bg-rule" />
          <span>{pythError ? <span className="text-descend">pyth: {pythError}</span> : 'Oracle nominal'}</span>
          <span className="w-px h-3 bg-rule" />
          <span>Pairs on-chain: {onChainActive.filter(Boolean).length}/{PAIRS_CONFIG.length}</span>
        </div>
      </section>

      <section className="px-6 pb-3">
        <PairRail activeIdx={activeIdx} onSelect={setActiveIdx} quotes={quotes} baseline={baseline} onChainActive={onChainActive} />
      </section>

      {/* Auto-event toasts */}
      {autoEvents.length > 0 && (
        <section className="px-6 pb-2 space-y-1.5">
          {autoEvents.slice(0, 3).map((ev, i) => (
            <div
              key={`${ev.pubkey}-${i}`}
              className={`text-[11px] uppercase tracking-[0.22em] px-3 py-2 border ${
                ev.error ? 'text-descend border-descend/40 bg-descend/5' : 'text-brass-bright border-brass/40 bg-brass/5'
              }`}
            >
              {ev.error ? (
                <>✗ {ev.pair} {ev.reason} trigger failed — {ev.error}</>
              ) : (
                <>
                  ⚡ {ev.pair} · {ev.reason.replace('-', ' ')} fired @ {ev.price.toFixed(5)} ·{' '}
                  {ev.sig && (
                    <a href={`https://explorer.solana.com/tx/${ev.sig}?cluster=devnet`} target="_blank" rel="noreferrer" className="underline">
                      view tx
                    </a>
                  )}
                </>
              )}
            </div>
          ))}
        </section>
      )}

      <section className="px-6 pb-10">
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-px bg-rule border border-rule items-stretch">
          <div className="bg-ink flex flex-col">
            <div className="flex items-end justify-between px-5 pt-5 pb-4">
              <div>
                <div className="eyebrow">Chart ✦ Pyth Benchmarks · TradingView Lightweight</div>
                <div className="mt-2 flex items-baseline gap-4 flex-wrap">
                  <span className="font-display italic text-brass-bright text-4xl leading-none">
                    {activeCfg.base}/{activeCfg.quote}
                  </span>
                  <span className="font-mono text-ivory text-4xl leading-none">
                    <FlipNumber value={livePrice} precision={activeCfg.precision} />
                  </span>
                  <span className={`font-mono text-sm ${dayDelta.dir === 'up' ? 'text-ascend' : dayDelta.dir === 'down' ? 'text-descend' : 'text-dim'}`} title="24h change">
                    {dayDelta.ready
                      ? `${dayDelta.dir === 'up' ? '▲' : dayDelta.dir === 'down' ? '▼' : '◆'} ${dayDelta.pct >= 0 ? '+' : ''}${dayDelta.pct.toFixed(3)}% 24h`
                      : '… 24h'}
                  </span>
                </div>
              </div>
              <div className="text-right text-[10px] uppercase tracking-[0.26em] text-dim">
                <div>
                  on-chain price:{' '}
                  <span className="text-brass/80 font-mono">
                    {activeChain?.isActive ? (activeChain.rawPrice / PRICE_DECIMALS).toFixed(activeCfg.precision) : '—'}
                  </span>
                </div>
                <div>
                  spread: <span className="text-brass/80 font-mono">{activeChain?.spreadPips.toFixed(1) ?? '1.0'} pips</span>
                </div>
              </div>
            </div>

            <div className="px-5 pb-4">
              <Boundary label="Chart">
                <ChartDesk
                  pythSymbol={`FX.${activeCfg.base}/${activeCfg.quote}`}
                  livePrice={livePrice}
                  precision={activeCfg.precision}
                  lines={chartLines}
                  height={600}
                />
              </Boundary>
            </div>

            {/* Legend under chart */}
            {chartLines.length > 0 && (
              <div className="px-5 pb-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-[10px] uppercase tracking-[0.22em] text-dim">
                <LegendDot color="#f6f1e7" label="Entry" />
                <LegendDot color="#c45a4f" label="Liquidation" dashed />
                <LegendDot color="#f59e0b" label="Stop Loss" dotted />
                <LegendDot color="#9ab973" label="Take Profit" dotted />
              </div>
            )}

            <div className="px-5 pb-5 pt-2 border-t border-rule flex flex-wrap items-center gap-x-6 gap-y-2 text-[10px] uppercase tracking-[0.26em] text-dim">
              <span>◐ Ivory on obsidian</span>
              <span>✦ Brass hour</span>
              <span>⟁ Folio I / IV</span>
              <span className="ml-auto">Program · ERSbyEx6…qy8ro · Devnet</span>
            </div>
          </div>

          <div className="bg-ink">
            <Boundary label="Trade Desk">
              <TradeDesk
                pair={{
                  base: activeCfg.base,
                  quote: activeCfg.quote,
                  pda: activeChain.pda,
                  price: livePrice,
                  precision: activeCfg.precision,
                  isActive: activeChain.isActive,
                }}
                marketOpen={market.isOpen}
                onOpened={() => {
                  fetchChain();
                  setTimeout(() => rescanPositions(), 1500);
                }}
              />
            </Boundary>
          </div>
        </div>

        {/* Positions panel spans full width under the split */}
        <div className="border-x border-b border-rule bg-ink">
          <Boundary label="Positions">
            <PositionsPanel
              positions={positions}
              quotes={quotes}
              activePair={activeKey}
              onSelectPair={onSelectPair}
              onRescan={rescanPositions}
              loading={positionsLoading}
            />
          </Boundary>
        </div>
      </section>
    </div>
  );
}

function LegendDot({ color, label, dashed, dotted }: { color: string; label: string; dashed?: boolean; dotted?: boolean }) {
  const style: React.CSSProperties = {
    borderTop: `2px ${dotted ? 'dotted' : dashed ? 'dashed' : 'solid'} ${color}`,
    width: 22,
  };
  return (
    <span className="inline-flex items-center gap-1.5">
      <span style={style} />
      {label}
    </span>
  );
}
