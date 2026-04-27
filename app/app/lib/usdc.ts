'use client';

import { useCallback, useEffect, useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { USDC_DECIMALS, USDC_MINT } from './constants';
import { getUserUsdcAta } from './useProgram';

// Polls the user's USDC ATA balance so the TradeDesk can show it and flag
// insufficient funds before the wallet prompt fires.
export function useUsdcBalance(pollMs = 6000): {
  balance: number | null; // human-readable (divided by 10^USDC_DECIMALS)
  raw: bigint | null;
  ataExists: boolean;
  refresh: () => Promise<void>;
} {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const [balance, setBalance] = useState<number | null>(null);
  const [raw, setRaw] = useState<bigint | null>(null);
  const [ataExists, setAtaExists] = useState(false);

  const refresh = useCallback(async () => {
    if (!publicKey) {
      setBalance(null);
      setRaw(null);
      setAtaExists(false);
      return;
    }
    const ata = getUserUsdcAta(publicKey);
    try {
      const res = await connection.getTokenAccountBalance(ata, 'confirmed');
      setRaw(BigInt(res.value.amount));
      setBalance(Number(res.value.uiAmountString));
      setAtaExists(true);
    } catch {
      setRaw(0n);
      setBalance(0);
      setAtaExists(false);
    }
  }, [publicKey, connection]);

  useEffect(() => {
    refresh();
    if (!publicKey) return;
    const id = setInterval(refresh, pollMs);
    return () => clearInterval(id);
  }, [publicKey, refresh, pollMs]);

  return { balance, raw, ataExists, refresh };
}

export async function claimFaucet(wallet: string): Promise<{ sig?: string; error?: string; amount?: number }> {
  try {
    const r = await fetch('/api/faucet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wallet }),
    });
    const data = await r.json();
    if (!r.ok) return { error: data.error || `HTTP ${r.status}` };
    return { sig: data.sig, amount: data.amount };
  } catch (exc: any) {
    return { error: String(exc?.message ?? exc).slice(0, 160) };
  }
}

export const USDC_HUMAN_DIVISOR = Math.pow(10, USDC_DECIMALS);
export { USDC_MINT };
