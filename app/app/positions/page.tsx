'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { useExchange, getExchangePDA, getPairPDA } from '../lib/useProgram';
import { PAIRS_CONFIG, PRICE_DECIMALS, PROGRAM_ID } from '../lib/constants';
import { usePythQuotes } from '../lib/pyth';
import { FlipNumber } from '../../components/FlipNumber';

interface LedgerRow {
  pubkey: string;
  pair: string;
  side: 'Ascend' | 'Descend';
  size: number;
  collateral: number;
  entryPrice: number;
  liqPrice: number;
  leverage: number;
  pairPda: string;
  precision: number;
}

export default function LedgerPage() {
  const { publicKey } = useWallet();
  const { exchange, canSign, connection } = useExchange();
  const { quotes } = usePythQuotes(4000);

  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [closing, setClosing] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ kind: 'ok' | 'err'; body: string; sig?: string } | null>(null);

  const fetchRows = useCallback(async () => {
    if (!publicKey || !exchange) return;
    setLoading(true);
    try {
      const accounts = await connection.getProgramAccounts(PROGRAM_ID, {
        filters: [
          { dataSize: 8 + 32 + 32 + 1 + 8 + 8 + 8 + 8 + 2 + 8 + 8 + 8 + 1 },
          { memcmp: { offset: 8, bytes: publicKey.toBase58() } },
        ],
      });
      const parsed: LedgerRow[] = [];
      for (const { pubkey, account } of accounts) {
        try {
          const p = (exchange.coder.accounts as any).decode('position', account.data);
          const pairKey = p.pair.toBase58();
          let pairLabel = pairKey.slice(0, 6) + '…';
          let precision = 5;
          for (const cfg of PAIRS_CONFIG) {
            if (getPairPDA(cfg.base, cfg.quote).toBase58() === pairKey) {
              pairLabel = `${cfg.base}/${cfg.quote}`;
              precision = cfg.precision;
              break;
            }
          }
          parsed.push({
            pubkey: pubkey.toBase58(),
            pair: pairLabel,
            side: p.side.long ? 'Ascend' : 'Descend',
            size: Number(p.size),
            collateral: Number(p.collateral),
            entryPrice: Number(p.entryPrice) / PRICE_DECIMALS,
            liqPrice: Number(p.liquidationPrice) / PRICE_DECIMALS,
            leverage: p.leverage,
            pairPda: pairKey,
            precision,
          });
        } catch {
          // skip
        }
      }
      setRows(parsed);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [publicKey, exchange, connection]);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  async function handleClose(row: LedgerRow) {
    if (!canSign || !publicKey) return;
    setClosing(row.pubkey);
    setFlash(null);
    try {
      const tx = await (exchange.methods as any)
        .closePosition()
        .accountsPartial({
          exchange: getExchangePDA(),
          pair: new PublicKey(row.pairPda),
          position: new PublicKey(row.pubkey),
          trader: publicKey,
        })
        .rpc();
      setFlash({ kind: 'ok', body: 'Position sealed.', sig: tx });
      fetchRows();
    } catch (exc) {
      const msg = String(exc).replace('Error: ', '');
      if (msg.includes('OracleStale')) setFlash({ kind: 'err', body: 'Oracle stale — crank needed.' });
      else if (msg.includes('User rejected')) setFlash({ kind: 'err', body: 'Rejected by user.' });
      else setFlash({ kind: 'err', body: msg.slice(0, 140) });
    } finally {
      setClosing(null);
    }
  }

  function pnl(row: LedgerRow) {
    const mark = quotes[row.pair]?.price ?? row.entryPrice;
    const sizeUsd = row.size / 1_000_000;
    const delta = row.side === 'Ascend' ? (mark - row.entryPrice) : (row.entryPrice - mark);
    const pct = (delta / row.entryPrice) * row.leverage * 100;
    const nominal = (delta / row.entryPrice) * sizeUsd;
    return { mark, pct, nominal };
  }

  const totals = useMemo(() => {
    if (rows.length === 0) return null;
    const all = rows.map(pnl);
    const nominal = all.reduce((s, x) => s + x.nominal, 0);
    const best = Math.max(...all.map((a) => a.pct));
    const worst = Math.min(...all.map((a) => a.pct));
    return { nominal, best, worst };
  }, [rows, quotes]);

  return (
    <div className="px-6 pt-10 pb-20">
      <div className="eyebrow">The Ledger ✦ Folio II</div>
      <h1 className="font-display text-ivory mt-3 text-4xl tracking-tight">Open positions, rendered in ink.</h1>
      <p className="text-dim mt-2 text-sm max-w-xl">
        Each entry below is a live on-chain record. Close at will — the desk will mark your exit in brass.
      </p>

      {flash && (
        <div
          className={`mt-6 border px-4 py-2 text-[11px] uppercase tracking-[0.24em] ${
            flash.kind === 'ok'
              ? 'border-ascend/40 text-ascend bg-ascend/5'
              : 'border-descend/40 text-descend bg-descend/5'
          }`}
        >
          {flash.body}
          {flash.sig && (
            <>
              {' '}·{' '}
              <a href={`https://explorer.solana.com/tx/${flash.sig}?cluster=devnet`} target="_blank" rel="noreferrer" className="underline">
                view tx
              </a>
            </>
          )}
        </div>
      )}

      {totals && (
        <div className="mt-8 grid grid-cols-3 gap-px bg-rule border border-rule">
          <StatTile label="Aggregate P&amp;L" value={`${totals.nominal >= 0 ? '+' : ''}${totals.nominal.toFixed(2)} USDC`} tone={totals.nominal >= 0 ? 'ascend' : 'descend'} />
          <StatTile label="Best Position" value={`${totals.best >= 0 ? '+' : ''}${totals.best.toFixed(2)}%`} tone="ascend" />
          <StatTile label="Worst Position" value={`${totals.worst >= 0 ? '+' : ''}${totals.worst.toFixed(2)}%`} tone="descend" />
        </div>
      )}

      <div className="mt-6 flex items-center justify-between">
        <div className="text-[10px] tracking-[0.26em] uppercase text-dim">
          {publicKey ? `Wallet · ${publicKey.toBase58().slice(0, 6)}…${publicKey.toBase58().slice(-4)}` : 'Connect wallet to read your ledger'}
        </div>
        <button
          onClick={fetchRows}
          className="text-[11px] tracking-[0.24em] uppercase text-dim hover:text-brass-bright border border-rule hover:border-brass/40 px-3 py-1.5"
        >
          {loading ? 'Rescanning…' : 'Rescan Chain'}
        </button>
      </div>

      {!publicKey ? null : rows.length === 0 ? (
        <div className="mt-8 border border-rule bg-surface/70 px-6 py-16 text-center text-dim text-sm">
          — The ledger is blank. Open your first position at the Desk. —
        </div>
      ) : (
        <div className="mt-6 border border-rule bg-surface/60">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-rule text-[10px] tracking-[0.24em] uppercase text-dim">
                <th className="text-left px-5 py-3 font-normal">Pair</th>
                <th className="text-left px-5 py-3 font-normal">Side</th>
                <th className="text-right px-5 py-3 font-normal">Size</th>
                <th className="text-right px-5 py-3 font-normal">Lev</th>
                <th className="text-right px-5 py-3 font-normal">Entry</th>
                <th className="text-right px-5 py-3 font-normal">Mark</th>
                <th className="text-right px-5 py-3 font-normal">Liq</th>
                <th className="text-right px-5 py-3 font-normal">P&amp;L</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const p = pnl(r);
                const pnlPos = p.nominal >= 0;
                return (
                  <tr key={r.pubkey} className="border-b border-rule/60 hover:bg-surface-raised/40">
                    <td className="px-5 py-4 font-display text-ivory">{r.pair}</td>
                    <td className={`px-5 py-4 font-display italic ${r.side === 'Ascend' ? 'text-ascend' : 'text-descend'}`}>
                      {r.side === 'Ascend' ? '↑ Ascend' : '↓ Descend'}
                    </td>
                    <td className="px-5 py-4 text-right font-mono text-ivory">{(r.size / 1_000_000).toFixed(2)}</td>
                    <td className="px-5 py-4 text-right font-mono text-brass">{r.leverage}x</td>
                    <td className="px-5 py-4 text-right font-mono text-dim">{r.entryPrice.toFixed(r.precision)}</td>
                    <td className="px-5 py-4 text-right font-mono text-ivory">
                      <FlipNumber value={p.mark} precision={r.precision} />
                    </td>
                    <td className="px-5 py-4 text-right font-mono text-descend">{r.liqPrice.toFixed(r.precision)}</td>
                    <td className={`px-5 py-4 text-right font-mono ${pnlPos ? 'text-ascend' : 'text-descend'}`}>
                      {pnlPos ? '+' : ''}
                      {p.nominal.toFixed(2)}
                      <span className="text-[10px] ml-1 text-dim">({pnlPos ? '+' : ''}{p.pct.toFixed(1)}%)</span>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <button
                        onClick={() => handleClose(r)}
                        disabled={closing === r.pubkey}
                        className="text-[11px] tracking-[0.22em] uppercase border border-rule hover:border-descend/60 hover:text-descend text-dim px-3 py-1.5 disabled:opacity-40"
                      >
                        {closing === r.pubkey ? 'Sealing…' : 'Seal Exit'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StatTile({ label, value, tone }: { label: string; value: string; tone: 'ascend' | 'descend' }) {
  return (
    <div className="bg-ink px-5 py-5">
      <div className="text-[10px] tracking-[0.26em] uppercase text-dim">{label}</div>
      <div className={`mt-2 font-display text-3xl ${tone === 'ascend' ? 'text-ascend' : 'text-descend'}`}>{value}</div>
    </div>
  );
}
