'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { PublicKey } from '@solana/web3.js';
import { useWallet } from '@solana/wallet-adapter-react';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { useExchange, getPairPDA, getPoolPDA, getUserUsdcAta, getVaultAta } from './useProgram';
import { PAIRS_CONFIG, PRICE_DECIMALS, PROGRAM_ID } from './constants';

export interface OpenPosition {
  pubkey: string;
  pair: string;
  pairCfg: (typeof PAIRS_CONFIG)[number];
  side: 'long' | 'short';
  sizeLamports: number;
  collateralLamports: number;
  entryPrice: number;
  liquidationPrice: number;
  leverage: number;
  pairPda: string;
  openedAt: number;
}

// Position account layout — must match programs/forexforsoul/src/state/position.rs.
//   discriminator(8) + trader(32) + pair(32) + side(1) + size(8) + collateral(8)
//   + entry_price(8) + liquidation_price(8) + leverage(2) + fees_paid(8)
//   + opened_at(8) + bump(1) = 122 bytes total.
const POSITION_SIZE = 8 + 32 + 32 + 1 + 8 + 8 + 8 + 8 + 2 + 8 + 8 + 1;

export function usePositions(pollMs = 5000) {
  const { publicKey } = useWallet();
  const { exchange, connection } = useExchange();

  const [positions, setPositions] = useState<OpenPosition[]>([]);
  const [loading, setLoading] = useState(false);
  const tickingRef = useRef(false);

  const scan = useCallback(async () => {
    if (!publicKey || !exchange || tickingRef.current) return;
    tickingRef.current = true;
    setLoading(true);
    try {
      const accounts = await connection.getProgramAccounts(PROGRAM_ID, {
        filters: [
          { dataSize: POSITION_SIZE },
          { memcmp: { offset: 8, bytes: publicKey.toBase58() } },
        ],
      });

      const parsed: OpenPosition[] = [];
      for (const { pubkey, account } of accounts) {
        try {
          const raw = (exchange.coder.accounts as any).decode('position', account.data);
          const pairKey = raw.pair.toBase58();
          let cfg: (typeof PAIRS_CONFIG)[number] | null = null;
          for (const c of PAIRS_CONFIG) {
            if (getPairPDA(c.base, c.quote).toBase58() === pairKey) {
              cfg = c;
              break;
            }
          }
          if (!cfg) continue;
          parsed.push({
            pubkey: pubkey.toBase58(),
            pair: `${cfg.base}/${cfg.quote}`,
            pairCfg: cfg,
            side: raw.side.long ? 'long' : 'short',
            sizeLamports: Number(raw.size),
            collateralLamports: Number(raw.collateral),
            entryPrice: Number(raw.entryPrice) / PRICE_DECIMALS,
            liquidationPrice: Number(raw.liquidationPrice) / PRICE_DECIMALS,
            leverage: raw.leverage,
            pairPda: pairKey,
            openedAt: Number(raw.openedAt ?? 0),
          });
        } catch {
          // malformed — skip
        }
      }
      // Newest first, fall back to pubkey for deterministic order when two
      // positions share an openedAt timestamp.
      parsed.sort((a, b) => (b.openedAt - a.openedAt) || a.pubkey.localeCompare(b.pubkey));
      setPositions(parsed);
    } catch (err) {
      console.error('positions scan', err);
    } finally {
      setLoading(false);
      tickingRef.current = false;
    }
  }, [publicKey, exchange, connection]);

  useEffect(() => {
    if (!publicKey) {
      setPositions([]);
      return;
    }
    let cancelled = false;
    const guarded = async () => {
      if (cancelled) return;
      await scan();
    };
    guarded();
    const id = setInterval(guarded, pollMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [publicKey, scan, pollMs]);

  return { positions, loading, rescan: scan };
}

export async function closePositionTx(
  exchange: any,
  publicKey: PublicKey,
  position: OpenPosition,
): Promise<string> {
  const [exchangePDA] = PublicKey.findProgramAddressSync([Buffer.from('exchange_v2')], PROGRAM_ID);
  return (exchange.methods as any)
    .closePosition()
    .accountsPartial({
      exchange: exchangePDA,
      pair: new PublicKey(position.pairPda),
      pool: getPoolPDA(),
      position: new PublicKey(position.pubkey),
      userUsdc: getUserUsdcAta(publicKey),
      vault: getVaultAta(),
      trader: publicKey,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .rpc();
}

export function pnlFor(position: OpenPosition, mark: number): { pct: number; nominal: number } {
  const sizeUsd = position.sizeLamports / 1_000_000;
  const delta = position.side === 'long' ? mark - position.entryPrice : position.entryPrice - mark;
  const pct = (delta / position.entryPrice) * position.leverage * 100;
  const nominal = (delta / position.entryPrice) * sizeUsd;
  return { pct, nominal };
}
