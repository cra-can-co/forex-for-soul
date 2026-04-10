'use client';

import { useState, useEffect, useRef } from 'react';

const PAIRS = [
  { symbol: 'EUR/USD', price: 1.0842, change: +0.12, spread: 0.8 },
  { symbol: 'GBP/USD', price: 1.2651, change: -0.08, spread: 1.1 },
  { symbol: 'USD/JPY', price: 157.32, change: +0.24, spread: 0.9 },
  { symbol: 'AUD/USD', price: 0.6534, change: -0.15, spread: 1.2 },
];

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
  const [activePair, setActivePair] = useState(PAIRS[0]);
  const [side, setSide] = useState<'long' | 'short'>('long');
  const [leverage, setLeverage] = useState(5);
  const [size, setSize] = useState('100');
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<any>(null);

  useEffect(() => {
    if (!chartRef.current) return;

    let cancelled = false;

    import('lightweight-charts').then(({ createChart }) => {
      if (cancelled || !chartRef.current) return;

      if (chartInstanceRef.current) {
        chartInstanceRef.current.remove();
      }

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
        upColor: '#22c55e',
        downColor: '#ef4444',
        borderUpColor: '#22c55e',
        borderDownColor: '#ef4444',
        wickUpColor: '#22c55e',
        wickDownColor: '#ef4444',
      });

      series.setData(generateCandles(activePair.price, 100) as any);
      chart.timeScale().fitContent();
      chartInstanceRef.current = chart;
    });

    return () => { cancelled = true; };
  }, [activePair]);

  const margin = (+size / leverage).toFixed(2);
  const liqPrice = side === 'long'
    ? (activePair.price * (1 - 1 / leverage * 0.9)).toFixed(4)
    : (activePair.price * (1 + 1 / leverage * 0.9)).toFixed(4);

  return (
    <div className="flex h-[calc(100vh-48px)]">
      {/* Left: Chart */}
      <div className="flex-1 flex flex-col">
        {/* Pair selector */}
        <div className="flex gap-1 p-2 bg-panel border-b border-border overflow-x-auto">
          {PAIRS.map((p) => (
            <button
              key={p.symbol}
              onClick={() => setActivePair(p)}
              className={`px-3 py-1.5 text-xs rounded whitespace-nowrap transition-colors ${
                activePair.symbol === p.symbol ? 'bg-surface border border-border text-white' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {p.symbol}
              <span className={`ml-2 ${p.change >= 0 ? 'text-long' : 'text-short'}`}>
                {p.change >= 0 ? '+' : ''}{p.change}%
              </span>
            </button>
          ))}
        </div>

        {/* Chart */}
        <div className="flex-1 bg-panel" ref={chartRef} />

        {/* Price bar */}
        <div className="flex items-center gap-6 px-4 py-2 bg-surface border-t border-border text-xs">
          <span className="text-white font-bold text-base">{activePair.price}</span>
          <span className="text-gray-500">Spread: {activePair.spread} pips</span>
          <span className={activePair.change >= 0 ? 'text-long' : 'text-short'}>
            {activePair.change >= 0 ? '+' : ''}{activePair.change}%
          </span>
        </div>
      </div>

      {/* Right: Trading panel */}
      <div className="w-72 bg-panel border-l border-border flex flex-col">
        <div className="p-4 border-b border-border">
          <h2 className="text-xs text-gray-500 font-bold tracking-wider mb-3">OPEN POSITION</h2>

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
            <label className="text-xs text-gray-500 mb-1 block">Size (USDC)</label>
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
              <span className="text-white">{activePair.price}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Required Margin</span>
              <span className="text-white">{margin} USDC</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Est. Liq. Price</span>
              <span className="text-short">{liqPrice}</span>
            </div>
          </div>

          <button className={`w-full py-2.5 rounded font-bold text-sm ${side === 'long' ? 'bg-long text-black' : 'bg-short text-white'}`}>
            {side === 'long' ? 'Open Long' : 'Open Short'}
          </button>
        </div>

        {/* Open Positions mini */}
        <div className="p-4 flex-1 overflow-y-auto">
          <h3 className="text-xs text-gray-500 font-bold tracking-wider mb-3">OPEN POSITIONS</h3>
          <div className="text-xs text-gray-600 text-center py-8">No open positions</div>
        </div>
      </div>
    </div>
  );
}
