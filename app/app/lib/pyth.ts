'use client';

import { useEffect, useRef, useState } from 'react';
import { PAIRS_CONFIG, PYTH_HERMES_BASE } from './constants';

export interface QuoteTick {
  symbol: string;          // "EUR/USD"
  price: number;           // human-readable, e.g. 1.17636
  prev: number | null;     // previous value for flash direction
  publishTime: number;     // unix seconds
  direction: 'up' | 'down' | 'flat';
  stale: boolean;
}

export type QuoteMap = Record<string, QuoteTick>;

// Pyth returns `{price: string, expo: number}`. Rehydrate into float.
function rehydrate(raw: { price: string; expo: number }): number {
  return Number(raw.price) * Math.pow(10, raw.expo);
}

async function fetchHermesLatest(ids: string[]): Promise<Record<string, { price: number; publishTime: number }>> {
  const q = ids.map((i) => `ids[]=${i}`).join('&');
  const url = `${PYTH_HERMES_BASE}/updates/price/latest?${q}&parsed=true`;
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error(`hermes ${r.status}`);
  const body = await r.json();
  const out: Record<string, { price: number; publishTime: number }> = {};
  for (const entry of body.parsed ?? []) {
    out[entry.id] = {
      price: rehydrate(entry.price),
      publishTime: entry.price.publish_time,
    };
  }
  return out;
}

export type BaselineMap = Record<string, number>;

export function usePyth24hBaseline(): { baseline: BaselineMap; ready: boolean } {
  const [baseline, setBaseline] = useState<BaselineMap>({});
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    const ids = PAIRS_CONFIG.map((c) => c.pythId);

    async function attempt(): Promise<boolean> {
      // Pyth Hermes exposes `/v2/updates/price/{publish_time}` returning the
      // nearest update ≥ that timestamp. Gaps appear around the 24-hour mark
      // when it falls inside a weekend, so we walk forward through a series of
      // offsets up to +24h, covering a full day of publish times.
      const baseTs = Math.floor(Date.now() / 1000) - 24 * 60 * 60;
      const offsets = [0, 60, 300, 900, 3600, 6 * 3600, 12 * 3600, 23 * 3600];
      for (const offset of offsets) {
        try {
          const q = ids.map((i) => `ids[]=${i}`).join('&');
          const url = `${PYTH_HERMES_BASE}/updates/price/${baseTs + offset}?${q}&parsed=true`;
          const r = await fetch(url, { cache: 'no-store' });
          if (!r.ok) continue;
          const body: any = await r.json();
          const next: BaselineMap = {};
          for (const entry of body.parsed ?? []) {
            const cfg = PAIRS_CONFIG.find((c) => c.pythId === entry.id);
            if (!cfg) continue;
            const human = Number(entry.price.price) * Math.pow(10, entry.price.expo);
            next[`${cfg.base}/${cfg.quote}`] = human;
          }
          if (cancelled) return true;
          if (Object.keys(next).length > 0) {
            setBaseline(next);
            setReady(true);
            return true;
          }
        } catch {
          // keep walking offsets
        }
      }
      return false;
    }

    async function loop() {
      if (cancelled) return;
      const ok = await attempt();
      if (ok || cancelled) return;
      // Retry with backoff if nothing came back (Hermes down / weekend gap).
      retryTimer = setTimeout(loop, 60_000);
    }

    loop();
    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, []);

  return { baseline, ready };
}

export function usePythQuotes(pollMs = 3000): { quotes: QuoteMap; lastAt: number | null; error: string | null } {
  const [quotes, setQuotes] = useState<QuoteMap>(() => {
    const seed: QuoteMap = {};
    for (const cfg of PAIRS_CONFIG) {
      seed[`${cfg.base}/${cfg.quote}`] = {
        symbol: `${cfg.base}/${cfg.quote}`,
        price: cfg.displayPrice,
        prev: null,
        publishTime: 0,
        direction: 'flat',
        stale: true,
      };
    }
    return seed;
  });
  const [lastAt, setLastAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const prevRef = useRef<Record<string, number>>({});

  useEffect(() => {
    let cancelled = false;
    const ids = PAIRS_CONFIG.map((c) => c.pythId);

    async function tick() {
      try {
        const res = await fetchHermesLatest(ids);
        if (cancelled) return;
        setQuotes((curr) => {
          const next: QuoteMap = { ...curr };
          const nowSec = Math.floor(Date.now() / 1000);
          for (const cfg of PAIRS_CONFIG) {
            const key = `${cfg.base}/${cfg.quote}`;
            const fresh = res[cfg.pythId];
            if (!fresh) continue;
            const prior = prevRef.current[key] ?? fresh.price;
            const dir: QuoteTick['direction'] =
              fresh.price > prior ? 'up' : fresh.price < prior ? 'down' : 'flat';
            // Mark as stale if the publishTime is more than 30s old — happens
            // whenever FX markets are closed and Pyth holds the last print.
            const isStale = nowSec - fresh.publishTime > 30;
            next[key] = {
              symbol: key,
              price: fresh.price,
              prev: prior,
              publishTime: fresh.publishTime,
              direction: dir,
              stale: isStale,
            };
            prevRef.current[key] = fresh.price;
          }
          return next;
        });
        setLastAt(Date.now());
        setError(null);
      } catch (exc) {
        if (cancelled) return;
        setError(String(exc).slice(0, 80));
        // When Hermes itself fails repeatedly, force the stale flag on so
        // auto-executor and UI can react.
        setQuotes((curr) => {
          const next: QuoteMap = {};
          for (const k in curr) next[k] = { ...curr[k], stale: true };
          return next;
        });
      }
    }

    tick();
    const id = setInterval(tick, pollMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [pollMs]);

  return { quotes, lastAt, error };
}
