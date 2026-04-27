'use client';

// Watches open positions + live Pyth quotes.
// Auto-fires close_position when SL / TP thresholds (local) or the contract's
// liquidation price are crossed. Fires at most once per position per mount to
// avoid double-closures; tracks fired pubkeys with a Set.

import { useEffect, useRef } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useExchange } from './useProgram';
import { OpenPosition, closePositionTx } from './positions';
import { OrderTargets } from './orders';
import { QuoteMap } from './pyth';
import { friendlyTxError } from './txErrors';

type Reason = 'stop-loss' | 'take-profit';

export interface AutoEvent {
  pubkey: string;
  pair: string;
  reason: Reason;
  price: number;
  sig?: string;
  error?: string;
}

export function useAutoExecutor(
  positions: OpenPosition[],
  quotes: QuoteMap,
  orders: Record<string, OrderTargets>,
  marketOpen: boolean,
  onEvent: (ev: AutoEvent) => void,
  onFired: (pubkey: string) => void,
) {
  const { publicKey } = useWallet();
  const { exchange, canSign } = useExchange();
  const firedRef = useRef<Set<string>>(new Set());
  const inflightRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!publicKey || !canSign) return;
    // Refuse to fire while FX market is closed — Pyth holds the last print and
    // prices drift only on spread ticks; acting on them would execute against
    // a frozen price even though the on-chain oracle still passes freshness.
    if (!marketOpen) return;

    for (const p of positions) {
      if (firedRef.current.has(p.pubkey) || inflightRef.current.has(p.pubkey)) continue;
      const q = quotes[p.pair];
      if (!q || q.stale) continue;
      const mark = q.price;

      const t = orders[p.pubkey];
      let reason: Reason | null = null;

      // Liquidation is now handled by the permissionless on-chain ix
      // `liquidate_position`; the off-chain crank sweeps for unhealthy tickets.
      // This hook only fires user-intent orders (SL / TP).
      if (t?.stopLoss != null) {
        if (p.side === 'long' && mark <= t.stopLoss) reason = 'stop-loss';
        if (p.side === 'short' && mark >= t.stopLoss) reason = 'stop-loss';
      }
      if (!reason && t?.takeProfit != null) {
        if (p.side === 'long' && mark >= t.takeProfit) reason = 'take-profit';
        if (p.side === 'short' && mark <= t.takeProfit) reason = 'take-profit';
      }

      if (!reason) continue;

      // Mark as fired BEFORE awaiting to close the race window where a re-render
      // could double-submit while the first tx is still in flight. If the
      // submit errors we roll `firedRef` back in the catch.
      inflightRef.current.add(p.pubkey);
      firedRef.current.add(p.pubkey);
      const trigger = reason;
      (async () => {
        try {
          const sig = await closePositionTx(exchange, publicKey, p);
          onEvent({ pubkey: p.pubkey, pair: p.pair, reason: trigger, price: mark, sig });
          onFired(p.pubkey);
        } catch (exc) {
          // Roll back so the user (or next tick) can retry, unless the error
          // says the account is already gone — then keep the guard in place.
          const raw = String((exc as any)?.message ?? exc ?? '');
          if (!/already|Account does not exist|does not exist/i.test(raw)) {
            firedRef.current.delete(p.pubkey);
          }
          onEvent({ pubkey: p.pubkey, pair: p.pair, reason: trigger, price: mark, error: friendlyTxError(exc) });
        } finally {
          inflightRef.current.delete(p.pubkey);
        }
      })();
    }
  }, [positions, quotes, orders, marketOpen, publicKey, canSign, exchange, onEvent, onFired]);
}
