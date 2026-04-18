'use client';

import { FlipNumber } from './FlipNumber';
import { PAIRS_CONFIG } from '../app/lib/constants';
import { BaselineMap, QuoteMap } from '../app/lib/pyth';

interface Props {
  activeIdx: number;
  onSelect: (idx: number) => void;
  quotes: QuoteMap;
  baseline: BaselineMap;
  onChainActive: boolean[];
}

function delta24h(price: number, base: number | undefined) {
  if (base == null || base === 0 || !Number.isFinite(base)) return { txt: '—', dir: 'flat' as const };
  const d = ((price - base) / base) * 100;
  const dir = d > 0 ? ('up' as const) : d < 0 ? ('down' as const) : ('flat' as const);
  return { txt: `${d >= 0 ? '+' : ''}${d.toFixed(3)}%`, dir };
}

export function PairRail({ activeIdx, onSelect, quotes, baseline, onChainActive }: Props) {
  return (
    <div className="grid grid-cols-4 gap-px bg-rule">
      {PAIRS_CONFIG.map((cfg, idx) => {
        const key = `${cfg.base}/${cfg.quote}`;
        const q = quotes[key];
        const price = q?.price ?? cfg.displayPrice;
        const d = delta24h(price, baseline[key]);
        const isActive = idx === activeIdx;
        const live = onChainActive[idx];
        return (
          <button
            key={key}
            onClick={() => onSelect(idx)}
            className={`card-brass relative text-left px-4 py-4 ${isActive ? 'is-active' : ''}`}
            style={{ borderRadius: 0 }}
          >
            <div className="deco-drop absolute inset-y-2 left-0" />
            <div className="flex items-start justify-between mb-2">
              <div>
                <div className="text-[10px] tracking-[0.24em] text-dim uppercase">{cfg.mythos}</div>
                <div className="flex items-baseline gap-2 mt-0.5">
                  <span className="font-display text-2xl text-ivory leading-none">
                    {cfg.base}<span className="text-brass/60">/</span>{cfg.quote}
                  </span>
                </div>
              </div>
              <div className="text-right">
                <span
                  className={`inline-flex items-center gap-1 font-mono text-[10px] px-1.5 py-0.5 border ${
                    d.dir === 'up'
                      ? 'text-ascend border-ascend/40'
                      : d.dir === 'down'
                      ? 'text-descend border-descend/40'
                      : 'text-dim border-rule'
                  }`}
                  title="24-hour change vs price 24h ago (Pyth)"
                >
                  {d.dir === 'up' ? '▲' : d.dir === 'down' ? '▼' : '◆'} {d.txt}
                </span>
                <div className={`mt-1 text-[9px] tracking-[0.22em] ${live ? 'text-ascend' : 'text-dim'}`}>
                  {live ? '● ON-CHAIN' : '○ OFFLINE'}
                </div>
              </div>
            </div>
            <div className="flex items-end justify-between">
              <div className="font-mono text-3xl text-ivory leading-none">
                <FlipNumber value={price} precision={cfg.precision} />
              </div>
              <div className="font-display italic text-brass/40 text-5xl leading-none pb-1">{cfg.glyph}</div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
