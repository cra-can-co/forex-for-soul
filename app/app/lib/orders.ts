'use client';

// Client-side SL/TP orders registry.
// Stored in localStorage keyed by position pubkey, scoped per connected wallet
// so two traders sharing a browser never see each other's orders. Synced across
// tabs of the same wallet via a `storage` event listener.

import { useCallback, useEffect, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';

export interface OrderTargets {
  stopLoss: number | null;
  takeProfit: number | null;
}

const LEGACY_LS_KEY = 'forex4soul.orders.v1'; // gitleaks:allow (localStorage key, not a secret)
const walletKey = (wallet: string) => `forex4soul.orders.v2.${wallet}`;

function readAll(wallet: string | null): Record<string, OrderTargets> {
  if (typeof window === 'undefined' || !wallet) return {};
  try {
    const raw = window.localStorage.getItem(walletKey(wallet));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed ? parsed : {};
  } catch {
    return {};
  }
}

function writeAll(wallet: string | null, next: Record<string, OrderTargets>) {
  if (typeof window === 'undefined' || !wallet) return;
  window.localStorage.setItem(walletKey(wallet), JSON.stringify(next));
}

// One-time migration: the v1 key was global (shared across wallets). On first
// read after this bump, we fold whatever it contained into the connected
// wallet's v2 bucket and then remove the v1 key.
function migrateLegacy(wallet: string) {
  if (typeof window === 'undefined') return;
  const legacy = window.localStorage.getItem(LEGACY_LS_KEY);
  if (!legacy) return;
  try {
    const parsed = JSON.parse(legacy);
    if (parsed && typeof parsed === 'object') {
      const curr = readAll(wallet);
      writeAll(wallet, { ...parsed, ...curr });
    }
  } catch {
    // ignore malformed legacy blob
  }
  window.localStorage.removeItem(LEGACY_LS_KEY);
}

export function useOrders() {
  const { publicKey } = useWallet();
  const walletId = publicKey?.toBase58() ?? null;
  const [map, setMap] = useState<Record<string, OrderTargets>>({});

  useEffect(() => {
    if (!walletId) {
      setMap({});
      return;
    }
    migrateLegacy(walletId);
    setMap(readAll(walletId));
    const onStorage = (ev: StorageEvent) => {
      if (ev.key === walletKey(walletId)) setMap(readAll(walletId));
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [walletId]);

  const setOrders = useCallback((positionPubkey: string, targets: OrderTargets) => {
    if (!walletId) return;
    setMap((curr) => {
      const next = { ...curr };
      if (targets.stopLoss == null && targets.takeProfit == null) {
        delete next[positionPubkey];
      } else {
        next[positionPubkey] = targets;
      }
      writeAll(walletId, next);
      return next;
    });
  }, [walletId]);

  const clearOrders = useCallback((positionPubkey: string) => {
    if (!walletId) return;
    setMap((curr) => {
      if (!(positionPubkey in curr)) return curr;
      const next = { ...curr };
      delete next[positionPubkey];
      writeAll(walletId, next);
      return next;
    });
  }, [walletId]);

  return { orders: map, setOrders, clearOrders };
}
