'use client';

import { useState, useEffect, useCallback } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { useExchange, getExchangePDA, getPairPDA } from '../lib/useProgram';
import { PROGRAM_ID, PRICE_DECIMALS, PAIRS_CONFIG } from '../lib/constants';

interface PositionView {
  pubkey: string;
  pair: string;
  side: 'Long' | 'Short';
  size: number;
  collateral: number;
  entryPrice: number;
  liqPrice: number;
  leverage: number;
  pairPda: string;
}

export default function PositionsPage() {
  const { publicKey } = useWallet();
  const { exchange, canSign, connection } = useExchange();
  const [positions, setPositions] = useState<PositionView[]>([]);
  const [loading, setLoading] = useState(false);
  const [closing, setClosing] = useState<string | null>(null);
  const [closeResult, setCloseResult] = useState<{ sig?: string; error?: string } | null>(null);

  const fetchPositions = useCallback(async () => {
    if (!publicKey || !exchange) return;
    setLoading(true);

    try {
      const accounts = await connection.getProgramAccounts(PROGRAM_ID, {
        filters: [
          { dataSize: 8 + 32 + 32 + 1 + 8 + 8 + 8 + 8 + 2 + 8 + 8 + 8 + 1 }, // Position size
          { memcmp: { offset: 8, bytes: publicKey.toBase58() } }, // trader field
        ],
      });

      const parsed: PositionView[] = [];
      for (const { pubkey, account } of accounts) {
        try {
          const pos = (exchange.coder.accounts as any).decode('position', account.data);
          const pairKey = pos.pair.toBase58();

          // find matching pair config
          let pairLabel = pairKey.slice(0, 8) + '...';
          for (const cfg of PAIRS_CONFIG) {
            const pda = getPairPDA(cfg.base, cfg.quote);
            if (pda.toBase58() === pairKey) {
              pairLabel = `${cfg.base}/${cfg.quote}`;
              break;
            }
          }

          parsed.push({
            pubkey: pubkey.toBase58(),
            pair: pairLabel,
            side: pos.side.long ? 'Long' : 'Short',
            size: Number(pos.size),
            collateral: Number(pos.collateral),
            entryPrice: Number(pos.entryPrice) / PRICE_DECIMALS,
            liqPrice: Number(pos.liquidationPrice) / PRICE_DECIMALS,
            leverage: pos.leverage,
            pairPda: pairKey,
          });
        } catch {
          // skip malformed
        }
      }

      setPositions(parsed);
    } catch (err) {
      console.error('Failed to fetch positions', err);
    } finally {
      setLoading(false);
    }
  }, [publicKey, exchange, connection]);

  useEffect(() => { fetchPositions(); }, [fetchPositions]);

  const handleClose = async (pos: PositionView) => {
    if (!canSign || !publicKey) return;
    setClosing(pos.pubkey);
    setCloseResult(null);

    try {
      const tx = await (exchange.methods as any)
        .closePosition()
        .accountsPartial({
          exchange: getExchangePDA(),
          pair: new PublicKey(pos.pairPda),
          position: new PublicKey(pos.pubkey),
          trader: publicKey,
        })
        .rpc();

      setCloseResult({ sig: tx });
      fetchPositions();
    } catch (exc) {
      const msg = String(exc).replace('Error: ', '');
      if (msg.includes('OracleStale')) {
        setCloseResult({ error: 'Price is stale — wait for crank update' });
      } else if (msg.includes('User rejected')) {
        setCloseResult({ error: 'Rejected by user' });
      } else {
        setCloseResult({ error: msg.slice(0, 100) });
      }
    } finally {
      setClosing(null);
    }
  };

  if (!publicKey) {
    return (
      <div className="p-6">
        <h1 className="text-sm font-bold tracking-wider text-gray-400 mb-4">OPEN POSITIONS</h1>
        <div className="text-xs text-gray-600 text-center py-12">Connect wallet to view positions</div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-sm font-bold tracking-wider text-gray-400">OPEN POSITIONS</h1>
        <button onClick={fetchPositions} className="text-xs text-gray-500 hover:text-white border border-border rounded px-2 py-1">
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {closeResult?.sig && (
        <div className="text-xs text-long bg-long/10 rounded p-2 mb-3">
          Position closed!{' '}
          <a href={`https://explorer.solana.com/tx/${closeResult.sig}?cluster=devnet`} target="_blank" rel="noreferrer" className="underline">
            View tx
          </a>
        </div>
      )}

      {closeResult?.error && (
        <div className="text-xs text-short bg-short/10 rounded p-2 mb-3">{closeResult.error}</div>
      )}

      {positions.length === 0 && !loading ? (
        <div className="text-xs text-gray-600 text-center py-12 bg-panel border border-border rounded">
          No open positions
        </div>
      ) : (
        <div className="bg-panel border border-border rounded overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-4 py-3 text-gray-500 font-semibold">Pair</th>
                <th className="text-left px-4 py-3 text-gray-500 font-semibold">Side</th>
                <th className="text-right px-4 py-3 text-gray-500 font-semibold">Size</th>
                <th className="text-right px-4 py-3 text-gray-500 font-semibold">Lev</th>
                <th className="text-right px-4 py-3 text-gray-500 font-semibold">Entry</th>
                <th className="text-right px-4 py-3 text-gray-500 font-semibold">Liq Price</th>
                <th className="text-right px-4 py-3 text-gray-500 font-semibold">Collateral</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {positions.map((pos) => (
                <tr key={pos.pubkey} className="border-b border-border/50 hover:bg-surface/50">
                  <td className="px-4 py-3 text-white font-semibold">{pos.pair}</td>
                  <td className="px-4 py-3">
                    <span className={pos.side === 'Long' ? 'text-long' : 'text-short'}>{pos.side}</span>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-300">{(pos.size / 1_000_000).toFixed(4)}</td>
                  <td className="px-4 py-3 text-right text-gray-300">{pos.leverage}x</td>
                  <td className="px-4 py-3 text-right text-gray-400">{pos.entryPrice.toFixed(4)}</td>
                  <td className="px-4 py-3 text-right text-short">{pos.liqPrice.toFixed(4)}</td>
                  <td className="px-4 py-3 text-right text-gray-400">{(pos.collateral / 1_000_000).toFixed(4)} SOL</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleClose(pos)}
                      disabled={closing === pos.pubkey}
                      className="text-gray-500 hover:text-short text-xs border border-border rounded px-2 py-1 disabled:opacity-40"
                    >
                      {closing === pos.pubkey ? 'Closing...' : 'Close'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
