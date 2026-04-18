'use client';

import { useEffect, useMemo } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { PointKind, labelFor, usePoints, KIND_COLORS } from '../lib/points';

export default function PointsPage() {
  const { publicKey } = useWallet();
  const { events, total, byKind, cumulative, award } = usePoints();

  // Award a tiny daily-visit bonus once per wallet-day
  useEffect(() => {
    if (!publicKey) return;
    const key = `forex4soul.daily.${publicKey.toBase58()}.${new Date().toISOString().slice(0, 10)}`;
    if (typeof window !== 'undefined' && !window.localStorage.getItem(key)) {
      window.localStorage.setItem(key, '1');
      award('daily-visit', 10);
    }
  }, [publicKey, award]);

  const sortedKinds = useMemo(
    () => Object.entries(byKind).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0)) as [PointKind, number][],
    [byKind],
  );

  const latest = useMemo(() => [...events].sort((a, b) => b.ts - a.ts).slice(0, 18), [events]);

  const rank = rankFor(total);

  return (
    <div className="px-6 pt-10 pb-20">
      <div className="eyebrow">The Chronicle ✦ Folio IV</div>
      <h1 className="font-display text-ivory mt-3 text-4xl tracking-tight">Points, earned in brass.</h1>
      <p className="text-dim mt-2 text-sm max-w-2xl">
        Every ascent, descent, and minute you hold is marked in the chronicle. Points accrue for notional,
        leverage, patience, realised profit, liquidations dodged, and vault provision. Tracked per wallet.
      </p>

      {!publicKey ? (
        <div className="mt-10 border border-rule bg-surface/60 px-6 py-16 text-center text-dim text-sm">
          Connect a wallet to begin your chronicle.
        </div>
      ) : (
        <>
          {/* Hero block */}
          <div className="mt-10 grid grid-cols-1 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] gap-px bg-rule border border-rule">
            <div className="bg-ink px-8 py-8 flex flex-col">
              <div className="text-[10px] tracking-[0.26em] uppercase text-dim">Aggregate</div>
              <div className="flex items-baseline gap-3 mt-2">
                <span className="font-display text-brass-bright text-[72px] leading-none">{total.toLocaleString()}</span>
                <span className="font-display italic text-brass text-xl">pts</span>
              </div>
              <div className="mt-6">
                <div className="text-[10px] tracking-[0.26em] uppercase text-dim">Rank</div>
                <div className="font-display text-ivory text-2xl mt-1">
                  {rank.label} <span className="text-brass/70 italic">· {rank.tier}</span>
                </div>
                <div className="mt-3 w-full bg-surface-raised border border-rule h-1.5 overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-brass to-brass-bright" style={{ width: `${Math.min(100, rank.progressPct).toFixed(1)}%` }} />
                </div>
                <div className="mt-1 text-[10px] text-dim tracking-widest">
                  {rank.nextLabel ? `${rank.toNext.toLocaleString()} pts to ${rank.nextLabel}` : 'highest rank reached'}
                </div>
              </div>
            </div>

            <div className="bg-ink px-8 py-8">
              <div className="text-[10px] tracking-[0.26em] uppercase text-dim mb-3">Points Over Time</div>
              <CumulativeLine data={cumulative} />
            </div>
          </div>

          {/* By action breakdown */}
          <section className="mt-10 border border-rule bg-ink">
            <div className="px-6 py-4 flex items-baseline justify-between border-b border-rule">
              <div>
                <div className="eyebrow">By Action</div>
                <div className="font-display text-ivory text-xl mt-1">Where the points came from</div>
              </div>
              <div className="text-[11px] text-dim tracking-widest uppercase">{events.length} events</div>
            </div>
            {sortedKinds.length === 0 ? (
              <div className="px-6 py-12 text-dim text-sm text-center">No events yet. Open a position to begin.</div>
            ) : (
              <div className="px-6 py-6">
                <BreakdownBars data={sortedKinds} total={total} />
              </div>
            )}
          </section>

          {/* Recent events */}
          <section className="mt-10 border border-rule bg-ink">
            <div className="px-6 py-4 border-b border-rule flex items-baseline justify-between">
              <div>
                <div className="eyebrow">Chronicle</div>
                <div className="font-display text-ivory text-xl mt-1">Last entries</div>
              </div>
              <div className="text-[11px] text-dim tracking-widest uppercase">newest first</div>
            </div>
            {latest.length === 0 ? (
              <div className="px-6 py-12 text-dim text-sm text-center">No entries yet.</div>
            ) : (
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="text-[10px] tracking-[0.22em] uppercase text-dim border-b border-rule">
                    <th className="text-left px-6 py-3 font-normal">When</th>
                    <th className="text-left px-6 py-3 font-normal">Action</th>
                    <th className="text-left px-6 py-3 font-normal">Detail</th>
                    <th className="text-right px-6 py-3 font-normal">Points</th>
                  </tr>
                </thead>
                <tbody>
                  {latest.map((e) => (
                    <tr key={e.id} className="border-b border-rule/40 hover:bg-surface-raised/40">
                      <td className="px-6 py-2.5 font-mono text-dim">{relativeTime(e.ts)}</td>
                      <td className="px-6 py-2.5">
                        <span className="inline-flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full" style={{ background: KIND_COLORS[e.kind] }} />
                          <span className="font-display italic text-ivory">{labelFor(e.kind)}</span>
                        </span>
                      </td>
                      <td className="px-6 py-2.5 text-dim text-[12px] font-mono">
                        {e.meta ? Object.entries(e.meta).map(([k, v]) => `${k}:${v}`).join(' · ') : '—'}
                      </td>
                      <td className="px-6 py-2.5 text-right font-mono text-brass-bright">+{e.points}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          {/* Legend */}
          <section className="mt-10 border border-rule bg-surface/40 px-6 py-6">
            <div className="eyebrow">Rules of the House</div>
            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-y-2 gap-x-8 text-[12px] text-dim">
              <Rule kind="open-position" body="0.5 pts per USDC notional on every open" />
              <Rule kind="big-size" body="Bonus for notional tiers: ≥100 → 50, ≥500 → 200, ≥1000 → 500" />
              <Rule kind="deep-leverage" body="Bonus for leverage: ≥5x → 40, ≥10x → 120, ≥20x → 300" />
              <Rule kind="hold-streak" body="1 pt/min per held position + 50 per hour completed" />
              <Rule kind="realised-pnl" body="20 pts per USDC profit on close" />
              <Rule kind="liquidation-dodged" body="25 pts for closing with >5% cushion over liquidation" />
              <Rule kind="vault-deposit" body="1 pt per USDC provisioned to vault" />
              <Rule kind="daily-visit" body="10 pts each day you open the desk" />
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function rankFor(total: number): { label: string; tier: string; progressPct: number; nextLabel: string | null; toNext: number } {
  const tiers = [
    { label: 'Initiate', tier: '—', min: 0 },
    { label: 'Brassbound', tier: 'I', min: 500 },
    { label: 'Candlekeeper', tier: 'II', min: 2_000 },
    { label: 'Nightwright', tier: 'III', min: 10_000 },
    { label: 'Oracle', tier: 'IV', min: 30_000 },
  ];
  let i = 0;
  for (let j = 0; j < tiers.length; j++) if (total >= tiers[j].min) i = j;
  const curr = tiers[i];
  const next = tiers[i + 1] ?? null;
  const span = next ? next.min - curr.min : 1;
  const into = next ? total - curr.min : 1;
  return {
    label: curr.label,
    tier: curr.tier,
    progressPct: next ? (into / span) * 100 : 100,
    nextLabel: next?.label ?? null,
    toNext: next ? next.min - total : 0,
  };
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function CumulativeLine({ data }: { data: { ts: number; total: number; kind: PointKind; points: number }[] }) {
  if (data.length < 2) {
    return (
      <div className="h-[180px] flex items-center justify-center text-dim text-[11px] tracking-widest uppercase">
        Earn points to see the line rise
      </div>
    );
  }
  const w = 520;
  const h = 180;
  const pad = { l: 30, r: 16, t: 16, b: 22 };
  const innerW = w - pad.l - pad.r;
  const innerH = h - pad.t - pad.b;

  const xs = data.map((d) => d.ts);
  const ys = data.map((d) => d.total);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys) * 1.1 || 1;

  const px = (ts: number) => pad.l + ((ts - minX) / Math.max(1, maxX - minX)) * innerW;
  const py = (y: number) => pad.t + innerH - (y / maxY) * innerH;

  const path = data
    .map((d, i) => `${i === 0 ? 'M' : 'L'} ${px(d.ts).toFixed(2)} ${py(d.total).toFixed(2)}`)
    .join(' ');

  const area = `${path} L ${px(maxX).toFixed(2)} ${(pad.t + innerH).toFixed(2)} L ${px(minX).toFixed(2)} ${(pad.t + innerH).toFixed(2)} Z`;

  // Y-axis ticks
  const yTicks = [0, 0.5, 1].map((f) => Math.round(maxY * f));

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-[180px]">
      <defs>
        <linearGradient id="ptArea" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#e8c583" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#e8c583" stopOpacity="0" />
        </linearGradient>
      </defs>
      {yTicks.map((v) => (
        <g key={v}>
          <line x1={pad.l} x2={w - pad.r} y1={py(v)} y2={py(v)} stroke="#2a2620" strokeDasharray="2 3" />
          <text x={pad.l - 6} y={py(v) + 3} fill="#5d584f" fontSize="9" textAnchor="end" fontFamily="JetBrains Mono">
            {v}
          </text>
        </g>
      ))}
      <path d={area} fill="url(#ptArea)" />
      <path d={path} stroke="#e8c583" strokeWidth={1.5} fill="none" />
      {data.slice(-1).map((d, i) => (
        <circle key={i} cx={px(d.ts)} cy={py(d.total)} r={3} fill="#e8c583" />
      ))}
      <text x={w - pad.r} y={pad.t + 10} fill="#8a857a" fontSize="9" textAnchor="end" fontFamily="Space Grotesk" letterSpacing="0.2em">
        TOTAL {data[data.length - 1].total.toLocaleString()}
      </text>
    </svg>
  );
}

function BreakdownBars({ data, total }: { data: [PointKind, number][]; total: number }) {
  return (
    <div className="space-y-3">
      {data.map(([kind, points]) => {
        const pct = total > 0 ? (points / total) * 100 : 0;
        return (
          <div key={kind} className="grid grid-cols-[180px_1fr_80px] gap-4 items-center">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full" style={{ background: KIND_COLORS[kind] }} />
              <span className="font-display italic text-ivory">{labelFor(kind)}</span>
            </div>
            <div className="relative h-2 bg-surface border border-rule overflow-hidden">
              <div
                className="absolute inset-y-0 left-0 transition-all"
                style={{ width: `${pct.toFixed(2)}%`, backgroundColor: KIND_COLORS[kind], opacity: 0.85 }}
              />
            </div>
            <div className="text-right font-mono text-brass-bright">
              {points.toLocaleString()}
              <span className="text-[10px] text-dim ml-1">({pct.toFixed(1)}%)</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Rule({ kind, body }: { kind: PointKind; body: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="w-1.5 h-1.5 rounded-full mt-2 flex-shrink-0" style={{ background: KIND_COLORS[kind] }} />
      <div>
        <span className="font-display italic text-ivory">{labelFor(kind)}</span>
        <span className="text-dim"> — {body}</span>
      </div>
    </div>
  );
}
