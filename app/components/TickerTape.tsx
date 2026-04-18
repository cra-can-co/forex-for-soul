'use client';

import { BaselineMap, QuoteMap } from '../app/lib/pyth';
import { PAIRS_CONFIG } from '../app/lib/constants';

interface Props {
  quotes: QuoteMap;
  baseline: BaselineMap;
}

function dayDelta(price: number, base: number | undefined): { text: string; dir: 'up' | 'down' | 'flat' } {
  if (base == null || base === 0 || !Number.isFinite(base)) return { text: '—', dir: 'flat' };
  const d = ((price - base) / base) * 100;
  const dir = d > 0 ? 'up' : d < 0 ? 'down' : 'flat';
  return { text: `${d >= 0 ? '+' : ''}${d.toFixed(3)}%`, dir };
}

export function TickerTape({ quotes, baseline }: Props) {
  const cells = PAIRS_CONFIG.map((cfg) => {
    const key = `${cfg.base}/${cfg.quote}`;
    const q = quotes[key];
    const price = q?.price ?? cfg.displayPrice;
    const delta = dayDelta(price, baseline[key]);
    return { key, cfg, price, delta };
  });

  const row = cells.concat(cells);

  return (
    <div className="relative overflow-hidden border-y border-rule bg-surface/70 backdrop-blur">
      <div className="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-ink to-transparent z-10" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-ink to-transparent z-10" />
      <div className="ticker-track py-2.5">
        {row.map((c, i) => (
          <div key={`${c.key}-${i}`} className="flex items-center gap-3 pl-10 whitespace-nowrap">
            <span className="font-display italic text-brass/80 text-sm">{c.cfg.mythos}</span>
            <span className="text-dim text-[11px] tracking-wider">{c.key}</span>
            <span className="font-mono text-ivory text-sm tabular-nums">
              {c.price.toFixed(c.cfg.precision)}
            </span>
            <span
              className={`font-mono text-[11px] ${
                c.delta.dir === 'up' ? 'text-ascend' : c.delta.dir === 'down' ? 'text-descend' : 'text-dim'
              }`}
            >
              {c.delta.dir === 'up' ? '▲' : c.delta.dir === 'down' ? '▼' : '◆'} {c.delta.text}
            </span>
            <span className="text-rule mx-4">◇</span>
          </div>
        ))}
      </div>
    </div>
  );
}
