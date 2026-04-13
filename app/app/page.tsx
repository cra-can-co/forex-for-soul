'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { PublicKey, SystemProgram } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';
import { useExchange, getExchangePDA, getPairPDA } from './lib/useProgram';
import { PAIRS_CONFIG, PRICE_DECIMALS, PROGRAM_ID } from './lib/constants';

interface PairData {
  base: string;
  quote: string;
  symbol: string;
  price: number;
  rawPrice: number;
  spread: number;
  oiLong: number;
  oiShort: number;
  isActive: boolean;
  pda: PublicKey;
}

function generateCandles(basePrice: number, count: number) {
  const candles = [];
  let p = basePrice;
  const now = Math.floor(Date.now() / 1000);
  for (let i = 0; i < count; i++) {
    const o = p;
    const h = o + Math.random() * 0.003;
    const l = o - Math.random() * 0.003;
    const c = l + Math.random() * (h - l);
    candles.push({
      time: now - (count - i) * 3600,
      open: +o.toFixed(4),
      high: +h.toFixed(4),
      low: +l.toFixed(4),
      close: +c.toFixed(4),
    });
    p = c;
  }
  return candles;
}

export default function TradePage() {
  const { publicKey } = useWallet();
  const { exchange, canSign, connection } = useExchange();

  const [pairs, setPairs] = useState<PairData[]>([]);
  const [activePairIdx, setActivePairIdx] = useState(0);
  const [side, setSide] = useState<'long' | 'short'>('long');
  const [leverage, setLeverage] = useState(5);
  const [size, setSize] = useState('100');
  const [txState, setTxState] = useState<'idle' | 'building' | 'signing' | 'confirming' | 'done' | 'error'>('idle');
  const [txError, setTxError] = useState('');
  const [txSig, setTxSig] = useState('');
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<any>(null);

  // fetch pairs from chain
  const fetchPairs = useCallback(async () => {
    if (!exchange) return;
    const loaded: PairData[] = [];
    for (const cfg of PAIRS_CONFIG) {
      try {
        const pda = getPairPDA(cfg.base, cfg.quote);
        const acc = await (exchange.account as any).tradingPair.fetch(pda);
        const rawPrice = Number(acc.lastPrice);
        loaded.push({
          base: cfg.base,
          quote: cfg.quote,
          symbol: `${cfg.base}/${cfg.quote}`,
          price: rawPrice > 0 ? rawPrice / PRICE_DECIMALS : cfg.displayPrice,
          rawPrice,
          spread: Number(acc.spreadBps) / 10,
          oiLong: Number(acc.openInterestLong),
          oiShort: Number(acc.openInterestShort),
          isActive: acc.isActive,
          pda,
        });
      } catch {
        // pair not created yet — use defaults
        const pda = getPairPDA(cfg.base, cfg.quote);
        loaded.push({
          base: cfg.base,
          quote: cfg.quote,
          symbol: `${cfg.base}/${cfg.quote}`,
          price: cfg.displayPrice,
          rawPrice: 0,
          spread: 1.0,
          oiLong: 0,
          oiShort: 0,
          isActive: false,
          pda,
        });
      }
    }
    setPairs(loaded);
  }, [exchange]);

  useEffect(() => { fetchPairs(); }, [fetchPairs]);

  // chart
  const activePair = pairs[activePairIdx] || {
    symbol: 'EUR/USD', price: 1.0842, spread: 1.0, isActive: false,
    base: 'EUR', quote: 'USD', pda: PublicKey.default, rawPrice: 0, oiLong: 0, oiShort: 0,
  };

  useEffect(() => {
    if (!chartRef.current) return;
    let cancelled = false;
    import('lightweight-charts').then(({ createChart }) => {
      if (cancelled || !chartRef.current) return;
      if (chartInstanceRef.current) chartInstanceRef.current.remove();

      const chart = createChart(chartRef.current, {
        width: chartRef.current.clientWidth,
        height: 400,
        layout: { background: { color: '#12151a' }, textColor: '#9ca3af' },
        grid: { vertLines: { color: '#1e2328' }, horzLines: { color: '#1e2328' } },
        crosshair: { mode: 0 },
        timeScale: { borderColor: '#2a2e36', timeVisible: true },
        rightPriceScale: { borderColor: '#2a2e36' },
      });

      const series = chart.addCandlestickSeries({
        upColor: '#22c55e', downColor: '#ef4444',
        borderUpColor: '#22c55e', borderDownColor: '#ef4444',
        wickUpColor: '#22c55e', wickDownColor: '#ef4444',
      });

      series.setData(generateCandles(activePair.price, 100) as any);
      chart.timeScale().fitContent();
      chartInstanceRef.current = chart;
    });

    return () => { cancelled = true; };
  }, [activePair.price, activePairIdx]);

  const sizeNum = parseFloat(size) || 0;
  const collateral = Math.floor(sizeNum / leverage);
  const margin = collateral.toFixed(2);
  const liqPrice = side === 'long'
    ? (activePair.price * (1 - 1 / leverage * 0.9)).toFixed(4)
    : (activePair.price * (1 + 1 / leverage * 0.9)).toFixed(4);

  const handleOpenPosition = async () => {
    if (!canSign || !publicKey) return;
    setTxState('building');
    setTxError('');
    setTxSig('');

    try {
      const exchangePDA = getExchangePDA();
      const pairPDA = activePair.pda;

      // generate random position ID
      const positionId = Date.now();

      const sizeVal = Math.floor(sizeNum * 1_000_000); // lamports
      const collateralVal = Math.floor(sizeVal / leverage);

      const sideArg = side === 'long' ? { long: {} } : { short: {} };

      setTxState('signing');

      const tx = await (exchange.methods as any)
        .openPosition(
          new BN(positionId),
          sideArg,
          new BN(sizeVal),
          new BN(collateralVal),
          leverage,
        )
        .accountsPartial({
          exchange: exchangePDA,
          pair: pairPDA,
          trader: publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      setTxState('done');
      setTxSig(tx);
      fetchPairs();
    } catch (exc) {
      setTxState('error');
      const msg = String(exc).replace('Error: ', '');
      if (msg.includes('User rejected')) {
        setTxError('Transaction rejected by user');
      } else if (msg.includes('OracleStale')) {
        setTxError('Price feed is stale — crank needs to update prices');
      } else if (msg.includes('InsufficientCollateral')) {
        setTxError('Insufficient collateral');
      } else if (msg.includes('insufficient lamports')) {
        setTxError('Insufficient SOL balance');
      } else {
        setTxError(msg.slice(0, 120));
      }
    }
  };

  const canTrade = publicKey && activePair.isActive && sizeNum > 0 && txState !== 'signing' && txState !== 'confirming';

  return (
    <div className="flex h-[calc(100vh-48px)]">
      {/* Left: Chart */}
      <div className="flex-1 flex flex-col">
        {/* Pair selector */}
        <div className="flex gap-1 p-2 bg-panel border-b border-border overflow-x-auto">
          {pairs.map((p, idx) => (
            <button
              key={p.symbol}
              onClick={() => setActivePairIdx(idx)}
              className={`px-3 py-1.5 text-xs rounded whitespace-nowrap transition-colors ${
                activePairIdx === idx ? 'bg-surface border border-border text-white' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {p.symbol}
              <span className="ml-2 text-gray-600">{p.price.toFixed(4)}</span>
              {!p.isActive && <span className="ml-1 text-yellow-600 text-[10px]">OFF</span>}
            </button>
          ))}
          {pairs.length === 0 && PAIRS_CONFIG.map(cfg => (
            <span key={cfg.base} className="px-3 py-1.5 text-xs text-gray-600">{cfg.base}/{cfg.quote}</span>
          ))}
        </div>

        {/* Chart */}
        <div className="flex-1 bg-panel" ref={chartRef} />

        {/* Price bar */}
        <div className="flex items-center gap-6 px-4 py-2 bg-surface border-t border-border text-xs">
          <span className="text-white font-bold text-base">{activePair.price.toFixed(4)}</span>
          <span className="text-gray-500">Spread: {activePair.spread.toFixed(1)} pips</span>
          {activePair.oiLong + activePair.oiShort > 0 && (
            <span className="text-gray-500">
              OI: L {(activePair.oiLong / 1_000_000).toFixed(1)} / S {(activePair.oiShort / 1_000_000).toFixed(1)}
            </span>
          )}
          {activePair.isActive && <span className="text-long text-[10px]">LIVE</span>}
        </div>
      </div>

      {/* Right: Trading panel */}
      <div className="w-72 bg-panel border-l border-border flex flex-col">
        <div className="p-4 border-b border-border">
          <h2 className="text-xs text-gray-500 font-bold tracking-wider mb-3">OPEN POSITION</h2>

          {!publicKey && (
            <div className="text-xs text-yellow-600 bg-yellow-900/20 rounded p-2 mb-3">
              Connect wallet to trade
            </div>
          )}

          {!activePair.isActive && publicKey && (
            <div className="text-xs text-yellow-600 bg-yellow-900/20 rounded p-2 mb-3">
              Pair not active on-chain
            </div>
          )}

          {/* Long/Short toggle */}
          <div className="flex gap-1 mb-4">
            <button
              onClick={() => setSide('long')}
              className={`flex-1 py-2 text-xs font-bold rounded ${side === 'long' ? 'bg-long text-black' : 'bg-surface text-gray-400 border border-border'}`}
            >
              LONG
            </button>
            <button
              onClick={() => setSide('short')}
              className={`flex-1 py-2 text-xs font-bold rounded ${side === 'short' ? 'bg-short text-white' : 'bg-surface text-gray-400 border border-border'}`}
            >
              SHORT
            </button>
          </div>

          {/* Size input */}
          <div className="mb-3">
            <label className="text-xs text-gray-500 mb-1 block">Size (lamports, x10^6)</label>
            <input
              value={size}
              onChange={(e) => setSize(e.target.value)}
              type="number"
              className="w-full bg-surface border border-border rounded px-3 py-2 text-sm text-white outline-none focus:border-gray-500"
            />
          </div>

          {/* Leverage slider */}
          <div className="mb-4">
            <div className="flex justify-between text-xs text-gray-500 mb-1">
              <span>Leverage</span>
              <span className="text-white font-bold">{leverage}x</span>
            </div>
            <input
              type="range"
              min={1}
              max={20}
              value={leverage}
              onChange={(e) => setLeverage(+e.target.value)}
              className="w-full accent-blue-500"
            />
            <div className="flex justify-between text-[10px] text-gray-600">
              <span>1x</span><span>5x</span><span>10x</span><span>20x</span>
            </div>
          </div>

          {/* Summary */}
          <div className="space-y-2 text-xs mb-4">
            <div className="flex justify-between">
              <span className="text-gray-500">Entry Price</span>
              <span className="text-white">{activePair.price.toFixed(4)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Collateral</span>
              <span className="text-white">{(collateral / 1_000_000).toFixed(4)} SOL</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Est. Liq. Price</span>
              <span className="text-short">{liqPrice}</span>
            </div>
          </div>

          <button
            onClick={handleOpenPosition}
            disabled={!canTrade}
            className={`w-full py-2.5 rounded font-bold text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
              side === 'long' ? 'bg-long text-black' : 'bg-short text-white'
            }`}
          >
            {txState === 'signing' ? 'Signing...' :
             txState === 'confirming' ? 'Confirming...' :
             txState === 'building' ? 'Building...' :
             side === 'long' ? 'Open Long' : 'Open Short'}
          </button>

          {txState === 'done' && txSig && (
            <div className="mt-2 text-xs text-long">
              Position opened!{' '}
              <a href={`https://explorer.solana.com/tx/${txSig}?cluster=devnet`} target="_blank" rel="noreferrer" className="underline">
                View tx
              </a>
            </div>
          )}

          {txState === 'error' && txError && (
            <div className="mt-2 text-xs text-short">{txError}</div>
          )}
        </div>

        {/* Mini positions */}
        <div className="p-4 flex-1 overflow-y-auto">
          <h3 className="text-xs text-gray-500 font-bold tracking-wider mb-3">OPEN POSITIONS</h3>
          {!publicKey ? (
            <div className="text-xs text-gray-600 text-center py-8">Connect wallet to see positions</div>
          ) : (
            <div className="text-xs text-gray-600 text-center py-8">
              See <a href="/positions" className="text-gray-400 underline">Positions</a> page
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
