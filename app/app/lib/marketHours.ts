'use client';

// FX market runs Sunday 17:00 → Friday 17:00 **New York time**, not UTC. Using
// America/New_York as the anchor keeps the banner accurate across EDT and EST
// (weekly open drifts between 21:00 and 22:00 UTC with DST).

import { useEffect, useState } from 'react';

// Weekly open / close anchors in New York local time.
export const OPEN_DOW_NY = 0;    // Sunday
export const OPEN_HOUR_NY = 17;  // 17:00 NY
export const CLOSE_DOW_NY = 5;   // Friday
export const CLOSE_HOUR_NY = 17; // 17:00 NY

export interface MarketStatus {
  isOpen: boolean;
  nextTransitionAt: Date;
  sessionOpen: Date;
  sessionClose: Date;
}

// Decompose a JS Date into its wall-clock parts in a given IANA timezone
// without allocating a full DateTimeFormat each call (these are called once
// per second so per-call allocation would be wasteful — we reuse).
const NY_FMT = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

const DOW = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 } as const;

function nyParts(d: Date): { dow: number; h: number; m: number; s: number } {
  const parts = NY_FMT.formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const weekday = get('weekday') as keyof typeof DOW;
  return {
    dow: DOW[weekday] ?? 0,
    h: Number(get('hour')) % 24, // en-US "24" returned occasionally at midnight
    m: Number(get('minute')),
    s: Number(get('second')),
  };
}

// Rounds to NY 17:00 for the current wall-clock date, preserving the NY
// offset of `d`. We do this by trial — add minutes until NY parts show 17:00
// on the target weekday. For precision within a second, we bisect.
function resolveNYBoundary(now: Date, targetDow: number, targetHour: number): Date {
  // Start from NY local midnight of `now` reverse-engineered via NY parts
  const parts = nyParts(now);
  const offsetMinutes = (targetHour - parts.h) * 60 - parts.m - parts.s / 60;
  let candidate = new Date(now.getTime() + offsetMinutes * 60_000);
  // Advance in whole days until weekday matches and candidate is in the future
  for (let i = 0; i < 10; i++) {
    const p = nyParts(candidate);
    if (p.dow === targetDow && p.h === targetHour && p.m === 0 && candidate.getTime() > now.getTime()) {
      return candidate;
    }
    if (p.dow === targetDow && p.h === targetHour && p.m === 0) {
      // past — advance a week
      candidate = new Date(candidate.getTime() + 7 * 86_400_000);
      continue;
    }
    // Snap to NY targetHour:00 on the same NY-day as candidate
    const q = nyParts(candidate);
    const dayShift = ((targetDow - q.dow) + 7) % 7;
    const hourShift = (targetHour - q.h) * 60 - q.m - q.s / 60;
    const shift = dayShift * 1440 + hourShift;
    candidate = new Date(candidate.getTime() + shift * 60_000);
    // Verify and nudge by ±60 min if DST changed
    const p2 = nyParts(candidate);
    if (p2.h !== targetHour) {
      candidate = new Date(candidate.getTime() + (targetHour - p2.h) * 60 * 60_000);
    }
    if (candidate.getTime() <= now.getTime()) {
      candidate = new Date(candidate.getTime() + 7 * 86_400_000);
    }
  }
  return candidate;
}

export function marketStatusAt(now: Date): MarketStatus {
  const p = nyParts(now);
  const minOfWeek = p.dow * 24 * 60 + p.h * 60 + p.m;
  const openMin = OPEN_DOW_NY * 24 * 60 + OPEN_HOUR_NY * 60;
  const closeMin = CLOSE_DOW_NY * 24 * 60 + CLOSE_HOUR_NY * 60;
  // Open from Sun 17:00 NY through Fri 17:00 NY.
  const isOpen = minOfWeek >= openMin && minOfWeek < closeMin;

  const nextClose = resolveNYBoundary(now, CLOSE_DOW_NY, CLOSE_HOUR_NY);
  const nextOpen = resolveNYBoundary(now, OPEN_DOW_NY, OPEN_HOUR_NY);

  const sessionOpen = new Date(nextOpen.getTime() - 7 * 86_400_000);
  const sessionClose = nextClose;

  return {
    isOpen,
    nextTransitionAt: isOpen ? nextClose : nextOpen,
    sessionOpen,
    sessionClose,
  };
}

export function useMarketStatus(tickMs = 1000): MarketStatus {
  const [status, setStatus] = useState<MarketStatus>(() => marketStatusAt(new Date()));
  useEffect(() => {
    const id = setInterval(() => setStatus(marketStatusAt(new Date())), tickMs);
    return () => clearInterval(id);
  }, [tickMs]);
  return status;
}

export interface TimezoneOption {
  id: string;
  label: string;
  ianaTz: string;
}

export const TIMEZONES: TimezoneOption[] = [
  { id: 'local',    label: 'Local',    ianaTz: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' },
  { id: 'utc',      label: 'UTC',      ianaTz: 'UTC' },
  { id: 'sydney',   label: 'Sydney',   ianaTz: 'Australia/Sydney' },
  { id: 'tokyo',    label: 'Tokyo',    ianaTz: 'Asia/Tokyo' },
  { id: 'london',   label: 'London',   ianaTz: 'Europe/London' },
  { id: 'new_york', label: 'New York', ianaTz: 'America/New_York' },
];

export function formatInTz(d: Date, ianaTz: string): { hm: string; dow: string; tzAbbr: string } {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: ianaTz,
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
    timeZoneName: 'short',
    hour12: false,
  });
  const parts = fmt.formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return {
    hm: `${get('hour')}:${get('minute')}`,
    dow: get('weekday'),
    tzAbbr: get('timeZoneName'),
  };
}

export function formatDuration(ms: number): string {
  if (ms <= 0) return '00:00:00';
  const totalSec = Math.floor(ms / 1000);
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  if (d > 0) return `${d}d ${pad(h)}:${pad(m)}:${pad(s)}`;
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}
