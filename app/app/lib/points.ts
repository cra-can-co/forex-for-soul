'use client';

// Client-side points ledger. Points are awarded for user actions and persisted
// per-wallet in localStorage. Rules are intentionally simple and deterministic
// so the same action always produces the same reward.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { OpenPosition } from './positions';

export type PointKind =
  | 'open-position'
  | 'hold-streak'
  | 'realised-pnl'
  | 'liquidation-dodged'
  | 'deep-leverage'
  | 'big-size'
  | 'vault-deposit'
  | 'daily-visit';

export interface PointEvent {
  id: string;
  kind: PointKind;
  points: number;
  label: string;
  meta?: Record<string, string | number>;
  ts: number;   // unix ms
}

const LS_KEY = (wallet: string) => `forex4soul.points.v1.${wallet}`;

function readAll(wallet: string): PointEvent[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(LS_KEY(wallet));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    return [];
  } catch {
    return [];
  }
}

function writeAll(wallet: string, events: PointEvent[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(LS_KEY(wallet), JSON.stringify(events));
}

const KIND_LABELS: Record<PointKind, string> = {
  'open-position': 'Opened position',
  'hold-streak': 'Held position',
  'realised-pnl': 'Realised profit',
  'liquidation-dodged': 'Liquidation avoided',
  'deep-leverage': 'Deep leverage',
  'big-size': 'Size tier',
  'vault-deposit': 'Vault deposit',
  'daily-visit': 'Daily visit',
};

export const KIND_COLORS: Record<PointKind, string> = {
  'open-position': '#c9a77c',
  'hold-streak': '#9ab973',
  'realised-pnl': '#e8c583',
  'liquidation-dodged': '#4a7c6b',
  'deep-leverage': '#c45a4f',
  'big-size': '#f59e0b',
  'vault-deposit': '#8a9cff',
  'daily-visit': '#f6f1e7',
};

export function labelFor(kind: PointKind): string {
  return KIND_LABELS[kind];
}

// Public hook — read + append + summarise
export function usePoints() {
  const { publicKey } = useWallet();
  const [events, setEvents] = useState<PointEvent[]>([]);

  useEffect(() => {
    if (!publicKey) { setEvents([]); return; }
    setEvents(readAll(publicKey.toBase58()));
  }, [publicKey]);

  const award = useCallback((kind: PointKind, points: number, meta?: Record<string, string | number>) => {
    if (!publicKey) return;
    const ev: PointEvent = {
      id: `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      kind,
      points: Math.max(0, Math.round(points)),
      label: KIND_LABELS[kind],
      meta,
      ts: Date.now(),
    };
    setEvents((prev) => {
      const next = [...prev, ev].slice(-500); // cap log
      writeAll(publicKey.toBase58(), next);
      return next;
    });
  }, [publicKey]);

  const total = useMemo(() => events.reduce((s, e) => s + e.points, 0), [events]);

  const byKind = useMemo(() => {
    const m: Partial<Record<PointKind, number>> = {};
    for (const e of events) m[e.kind] = (m[e.kind] ?? 0) + e.points;
    return m;
  }, [events]);

  const cumulative = useMemo(() => {
    const sorted = [...events].sort((a, b) => a.ts - b.ts);
    let running = 0;
    return sorted.map((e) => {
      running += e.points;
      return { ts: e.ts, total: running, kind: e.kind, points: e.points, label: e.label };
    });
  }, [events]);

  return { events, award, total, byKind, cumulative };
}

// Awarding rules ------------------------------------------------------------

export function pointsForOpen(sizeUSDC: number, leverage: number): { base: number; bigSize: number; deepLev: number } {
  const base = Math.round(sizeUSDC * 0.5);           // 50 pts per $100 notional
  const bigSize = sizeUSDC >= 1000 ? 500 : sizeUSDC >= 500 ? 200 : sizeUSDC >= 100 ? 50 : 0;
  const deepLev = leverage >= 20 ? 300 : leverage >= 10 ? 120 : leverage >= 5 ? 40 : 0;
  return { base, bigSize, deepLev };
}

export function pointsForHold(openedAt: number, nowMs: number): number {
  const minutes = Math.max(0, (nowMs - openedAt) / 60_000);
  // 1 pt per minute, +50 per hour completed
  const hours = Math.floor(minutes / 60);
  return Math.round(minutes) + hours * 50;
}

export function pointsForRealisedPnl(pnlUsd: number): number {
  if (pnlUsd <= 0) return 0;
  return Math.round(pnlUsd * 20); // $5 profit → 100 pts
}

// Drives the "hold-streak" periodic tick: every minute we award 1 pt per minute
// held, per open position. State is persisted in localStorage (keyed by
// position pubkey) so a page reload does NOT back-award minutes already
// granted.
const HOLD_LS_KEY = 'forex4soul.hold.v1';

function readHoldMap(): Record<string, number> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(HOLD_LS_KEY);
    return raw ? (JSON.parse(raw) as Record<string, number>) : {};
  } catch {
    return {};
  }
}

function writeHoldMap(m: Record<string, number>) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(HOLD_LS_KEY, JSON.stringify(m));
}

export function useHoldStreakAward(positions: OpenPosition[]) {
  const { award } = usePoints();
  const lastAwardedRef = useRef<Record<string, number>>({});
  const loadedRef = useRef(false);

  // Hydrate once on mount from localStorage, and clean entries for closed
  // positions so the map doesn't grow forever.
  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    lastAwardedRef.current = readHoldMap();
  }, []);

  useEffect(() => {
    const alive = new Set(positions.map((p) => p.pubkey));
    let changed = false;
    for (const k of Object.keys(lastAwardedRef.current)) {
      if (!alive.has(k)) {
        delete lastAwardedRef.current[k];
        changed = true;
      }
    }
    if (changed) writeHoldMap(lastAwardedRef.current);
  }, [positions]);

  useEffect(() => {
    const id = setInterval(() => {
      const now = Date.now();
      let dirty = false;
      for (const p of positions) {
        const last = lastAwardedRef.current[p.pubkey] ?? (p.openedAt > 0 ? p.openedAt * 1000 : now);
        const delta = now - last;
        if (delta < 60_000) continue;
        const minutes = Math.floor(delta / 60_000);
        award('hold-streak', minutes, { position: p.pair, minutes });
        lastAwardedRef.current[p.pubkey] = last + minutes * 60_000;
        dirty = true;
      }
      if (dirty) writeHoldMap(lastAwardedRef.current);
    }, 60_000);
    return () => clearInterval(id);
  }, [positions, award]);
}
