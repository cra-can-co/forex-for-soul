'use client';

import { useEffect, useState } from 'react';
import { formatDuration, formatInTz, TIMEZONES, useMarketStatus } from '../app/lib/marketHours';

const TZ_LS_KEY = 'forex4soul.tz.v1'; // gitleaks:allow

export function MarketClock() {
  const status = useMarketStatus(1000);
  const [tzId, setTzId] = useState<string>('local');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = window.localStorage.getItem(TZ_LS_KEY);
    if (saved) setTzId(saved);
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') window.localStorage.setItem(TZ_LS_KEY, tzId);
  }, [tzId]);

  const tz = TIMEZONES.find((t) => t.id === tzId) ?? TIMEZONES[0];
  const now = new Date();
  const here = formatInTz(now, tz.ianaTz);
  const transitionHere = formatInTz(status.nextTransitionAt, tz.ianaTz);
  const remaining = status.nextTransitionAt.getTime() - now.getTime();

  return (
    <div
      className={`border ${
        status.isOpen ? 'border-ascend/40 bg-ascend/5' : 'border-descend/40 bg-descend/5'
      }`}
    >
      <div className="px-5 py-3 flex items-center flex-wrap gap-x-6 gap-y-2">
        {/* Status dot */}
        <div className="flex items-center gap-2.5">
          <span
            className={`relative inline-flex w-2.5 h-2.5 rounded-full ${
              status.isOpen ? 'bg-ascend' : 'bg-descend'
            }`}
          >
            {status.isOpen && <span className="absolute inset-0 rounded-full bg-ascend animate-ping opacity-60" />}
          </span>
          <span
            className={`font-display italic text-lg ${
              status.isOpen ? 'text-ascend' : 'text-descend'
            }`}
          >
            {status.isOpen ? 'Markets Open' : 'Markets Closed'}
          </span>
          <span className="text-[10px] uppercase tracking-[0.26em] text-dim ml-1">
            FX · 24/5
          </span>
        </div>

        {/* Divider */}
        <span className="hidden md:inline-block w-px h-5 bg-rule" />

        {/* Now in selected TZ */}
        <div className="flex items-baseline gap-2">
          <span className="text-[10px] uppercase tracking-[0.26em] text-dim">Now</span>
          <span className="font-mono text-ivory">
            {here.dow} {here.hm}
          </span>
          <span className="font-mono text-[10px] text-dim">{here.tzAbbr}</span>
        </div>

        {/* Countdown */}
        <div className="flex items-baseline gap-2">
          <span className="text-[10px] uppercase tracking-[0.26em] text-dim">
            {status.isOpen ? 'Closes in' : 'Opens in'}
          </span>
          <span className="font-mono text-brass-bright">{formatDuration(remaining)}</span>
        </div>

        <div className="flex items-baseline gap-2">
          <span className="text-[10px] uppercase tracking-[0.26em] text-dim">
            {status.isOpen ? 'Close' : 'Open'}
          </span>
          <span className="font-mono text-ivory">
            {transitionHere.dow} {transitionHere.hm}
          </span>
          <span className="font-mono text-[10px] text-dim">{transitionHere.tzAbbr}</span>
        </div>

        {/* TZ selector */}
        <div className="ml-auto flex items-center gap-1 flex-wrap">
          <span className="text-[10px] uppercase tracking-[0.26em] text-dim mr-1">Timezone</span>
          {TIMEZONES.map((t) => (
            <button
              key={t.id}
              onClick={() => setTzId(t.id)}
              className={`text-[10px] uppercase tracking-[0.2em] px-2 py-1 border transition-colors ${
                tzId === t.id
                  ? 'border-brass text-brass-bright bg-brass/5'
                  : 'border-rule text-dim hover:text-ivory hover:border-brass/40'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
