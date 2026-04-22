'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

export interface ChartLine {
  id: string;
  price: number;
  color: string;
  title: string;
  style?: 'solid' | 'dashed' | 'dotted';
}

export type Resolution = '1' | '5' | '15' | '60' | '240' | 'D';

interface Props {
  pythSymbol: string;  // e.g. "FX.EUR/USD"
  livePrice: number | null;
  precision: number;
  lines: ChartLine[];
  height?: number;
}

interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

// Pyth Benchmarks rejects ranges > 1 year and returns empty for periods when
// the market was closed, so per-resolution lookbacks are tuned to (a) stay
// under the 1-year cap and (b) reach into the prior weekday session so 1m/5m
// still show something over weekends.
const RESOLUTIONS: { key: Resolution; label: string; bucket: number; lookback: number }[] = [
  { key: '1',   label: '1m',  bucket: 60,             lookback: 3000 }, // ~50h back
  { key: '5',   label: '5m',  bucket: 5 * 60,         lookback: 1500 }, // ~5.2d
  { key: '15',  label: '15m', bucket: 15 * 60,        lookback: 600  }, // ~6.25d
  { key: '60',  label: '1h',  bucket: 60 * 60,        lookback: 400  }, // ~16.7d
  { key: '240', label: '4h',  bucket: 4 * 60 * 60,    lookback: 400  }, // ~66d
  { key: 'D',   label: '1D',  bucket: 24 * 60 * 60,   lookback: 300  }, // ~300d, under 365 cap
];

const MAX_RANGE_SEC = 360 * 24 * 60 * 60; // hard cap: 360 days

async function fetchCandles(
  symbol: string,
  resolution: Resolution,
  bucketSeconds: number,
  lookback: number,
  signal?: AbortSignal,
): Promise<Candle[]> {
  const now = Math.floor(Date.now() / 1000);
  const span = Math.min(lookback * bucketSeconds, MAX_RANGE_SEC);
  const from = now - span;
  const url = `https://benchmarks.pyth.network/v1/shims/tradingview/history?symbol=${encodeURIComponent(symbol)}&from=${from}&to=${now}&resolution=${resolution}`;
  const r = await fetch(url, { signal });
  if (!r.ok) throw new Error(`benchmarks ${r.status}`);
  const b = await r.json();
  if (b.s !== 'ok' || !Array.isArray(b.t)) return [];
  const out: Candle[] = [];
  for (let i = 0; i < b.t.length; i++) {
    out.push({ time: b.t[i], open: b.o[i], high: b.h[i], low: b.l[i], close: b.c[i] });
  }
  return out;
}

function sma(closes: number[], period: number, times: number[]) {
  const out: { time: number; value: number }[] = [];
  for (let i = period - 1; i < closes.length; i++) {
    let s = 0;
    for (let j = i - period + 1; j <= i; j++) s += closes[j];
    out.push({ time: times[i], value: s / period });
  }
  return out;
}

function ema(closes: number[], period: number, times: number[]) {
  const out: { time: number; value: number }[] = [];
  if (closes.length < period) return out;
  const k = 2 / (period + 1);
  // seed with SMA of first N
  let prev = 0;
  for (let i = 0; i < period; i++) prev += closes[i];
  prev /= period;
  out.push({ time: times[period - 1], value: prev });
  for (let i = period; i < closes.length; i++) {
    prev = closes[i] * k + prev * (1 - k);
    out.push({ time: times[i], value: prev });
  }
  return out;
}

export function ChartDesk({ pythSymbol, livePrice, precision, lines, height = 400 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const seriesRef = useRef<any>(null);
  const smaSeriesRef = useRef<any>(null);
  const emaSeriesRef = useRef<any>(null);
  const priceLinesRef = useRef<Map<string, any>>(new Map());
  const userLinesRef = useRef<Map<string, any>>(new Map());
  const lastCandleRef = useRef<Candle | null>(null);
  const candlesRef = useRef<Candle[]>([]);

  const [resolution, setResolution] = useState<Resolution>('15');
  const [showSMA, setShowSMA] = useState(true);
  const [showEMA, setShowEMA] = useState(false);
  interface Alert { id: string; price: number }
  const [alertLines, setAlertLines] = useState<Alert[]>([]);
  const [addingAlert, setAddingAlert] = useState(false);

  const resSpec = useMemo(() => RESOLUTIONS.find((r) => r.key === resolution) ?? RESOLUTIONS[2], [resolution]);
  const bucket = resSpec.bucket;
  const lookback = resSpec.lookback;

  // (Re)initialise the chart when symbol, resolution, or precision changes.
  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;
    const abort = new AbortController();
    let ro: ResizeObserver | null = null;
    const fetchTimeout = setTimeout(() => abort.abort(), 12_000);

    (async () => {
      const { createChart, CrosshairMode, LineStyle } = await import('lightweight-charts');
      if (cancelled || !containerRef.current) return;

      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
        seriesRef.current = null;
        smaSeriesRef.current = null;
        emaSeriesRef.current = null;
        priceLinesRef.current.clear();
        userLinesRef.current.clear();
      }

      const chart = createChart(containerRef.current, {
        width: containerRef.current.clientWidth,
        height,
        layout: {
          background: { color: '#0d0b0a' },
          textColor: '#8a857a',
          fontFamily: '"JetBrains Mono", monospace',
        },
        grid: {
          vertLines: { color: 'rgba(201,167,124,0.05)' },
          horzLines: { color: 'rgba(201,167,124,0.05)' },
        },
        crosshair: {
          mode: CrosshairMode.Normal,
          vertLine: { color: 'rgba(232,197,131,0.4)', width: 1, style: LineStyle.Dashed, labelBackgroundColor: '#c9a77c' },
          horzLine: { color: 'rgba(232,197,131,0.4)', width: 1, style: LineStyle.Dashed, labelBackgroundColor: '#c9a77c' },
        },
        timeScale: {
          borderColor: '#2a2620',
          timeVisible: true,
          secondsVisible: resolution === '1',
          rightOffset: 8,
          barSpacing: 6,
        },
        rightPriceScale: {
          borderColor: '#2a2620',
          scaleMargins: { top: 0.08, bottom: 0.12 },
        },
        watermark: {
          visible: true,
          fontSize: 40,
          horzAlign: 'center',
          vertAlign: 'center',
          color: 'rgba(201,167,124,0.06)',
          fontFamily: 'Fraunces, serif',
          text: pythSymbol.replace('FX.', ''),
        },
      });

      const series = chart.addCandlestickSeries({
        upColor: '#9ab973',
        downColor: '#c45a4f',
        borderUpColor: '#9ab973',
        borderDownColor: '#c45a4f',
        wickUpColor: '#9ab973',
        wickDownColor: '#c45a4f',
        priceFormat: { type: 'price', precision, minMove: Math.pow(10, -precision) },
      });

      chartRef.current = chart;
      seriesRef.current = series;

      try {
        const candles = await fetchCandles(pythSymbol, resolution, bucket, lookback, abort.signal);
        if (cancelled) return;
        if (candles.length > 0) {
          series.setData(candles as any);
          lastCandleRef.current = candles[candles.length - 1];
          candlesRef.current = candles;
          chart.timeScale().fitContent();
          chart.timeScale().scrollToPosition(5, false);
          if (showSMA) addSMA(chart);
          if (showEMA) addEMA(chart);
        }
      } catch (exc) {
        console.error('fetchCandles', exc);
      }

      // Click-to-drop alert line
      chart.subscribeClick((param: any) => {
        if (!addingAlertRef.current) return;
        const y = param?.point?.y;
        if (y == null || !seriesRef.current) return;
        const price = seriesRef.current.coordinateToPrice(y);
        if (price == null) return;
        const id = `alert-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        setAlertLines((prev) => [...prev, { id, price: Number(price) }]);
        setAddingAlert(false);
      });

      ro = new ResizeObserver(() => {
        if (!containerRef.current || !chartRef.current) return;
        chartRef.current.applyOptions({ width: containerRef.current.clientWidth });
      });
      ro.observe(containerRef.current);
    })();

    return () => {
      cancelled = true;
      abort.abort();
      clearTimeout(fetchTimeout);
      if (ro) ro.disconnect();
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
      seriesRef.current = null;
      smaSeriesRef.current = null;
      emaSeriesRef.current = null;
      priceLinesRef.current.clear();
      userLinesRef.current.clear();
      lastCandleRef.current = null;
      candlesRef.current = [];
    };
  }, [pythSymbol, resolution, height, precision, bucket, lookback]);

  // Stash addingAlert in a ref so the subscribeClick closure can read its latest value.
  const addingAlertRef = useRef(addingAlert);
  useEffect(() => { addingAlertRef.current = addingAlert; }, [addingAlert]);

  function addSMA(chart: any) {
    const candles = candlesRef.current;
    if (candles.length < 20) return;
    const times = candles.map((c) => c.time);
    const closes = candles.map((c) => c.close);
    const data = sma(closes, 20, times);
    const s = chart.addLineSeries({ color: '#e8c583', lineWidth: 1.2, priceLineVisible: false, lastValueVisible: false });
    s.setData(data as any);
    smaSeriesRef.current = s;
  }

  function addEMA(chart: any) {
    const candles = candlesRef.current;
    if (candles.length < 50) return;
    const times = candles.map((c) => c.time);
    const closes = candles.map((c) => c.close);
    const data = ema(closes, 50, times);
    const s = chart.addLineSeries({ color: '#4a7c6b', lineWidth: 1.2, priceLineVisible: false, lastValueVisible: false });
    s.setData(data as any);
    emaSeriesRef.current = s;
  }

  // Toggle indicators live
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    if (showSMA && !smaSeriesRef.current) addSMA(chart);
    if (!showSMA && smaSeriesRef.current) {
      chart.removeSeries(smaSeriesRef.current);
      smaSeriesRef.current = null;
    }
  }, [showSMA]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    if (showEMA && !emaSeriesRef.current) addEMA(chart);
    if (!showEMA && emaSeriesRef.current) {
      chart.removeSeries(emaSeriesRef.current);
      emaSeriesRef.current = null;
    }
  }, [showEMA]);

  // Apply external price lines (Entry / Liq / SL / TP from positions)
  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;
    const styleMap: Record<string, number> = { solid: 0, dotted: 1, dashed: 2 };
    const existing = priceLinesRef.current;
    const nextIds = new Set(lines.map((l) => l.id));

    for (const [id, handle] of existing) {
      if (!nextIds.has(id)) {
        try { series.removePriceLine(handle); } catch {}
        existing.delete(id);
      }
    }
    for (const l of lines) {
      const prior = existing.get(l.id);
      if (prior) {
        try { series.removePriceLine(prior); } catch {}
      }
      const handle = series.createPriceLine({
        price: l.price,
        color: l.color,
        lineStyle: styleMap[l.style ?? 'dashed'] ?? 2,
        lineWidth: 1,
        axisLabelVisible: true,
        title: l.title,
      } as any);
      existing.set(l.id, handle);
    }
  }, [lines]);

  // User-drawn alert lines (stable ids so reordering or removing any one
  // entry doesn't flush the whole set).
  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;
    const existing = userLinesRef.current;

    const nextIds = new Set(alertLines.map((a) => a.id));
    for (const [id, handle] of existing) {
      if (!nextIds.has(id)) {
        try { series.removePriceLine(handle); } catch {}
        existing.delete(id);
      }
    }
    alertLines.forEach((a, idx) => {
      if (existing.has(a.id)) return;
      const handle = series.createPriceLine({
        price: a.price,
        color: '#c9a77c',
        lineStyle: 2,
        lineWidth: 1,
        axisLabelVisible: true,
        title: `Alert ${(idx + 1).toString().padStart(2, '0')}`,
      } as any);
      existing.set(a.id, handle);
    });
  }, [alertLines]);

  // Live-tick update: extend last candle with current Pyth price
  useEffect(() => {
    const series = seriesRef.current;
    const last = lastCandleRef.current;
    if (!series || !last || livePrice == null || !Number.isFinite(livePrice)) return;

    const nowSec = Math.floor(Date.now() / 1000);
    const bucketTime = Math.floor(nowSec / bucket) * bucket;

    if (bucketTime > last.time) {
      const fresh: Candle = { time: bucketTime, open: livePrice, high: livePrice, low: livePrice, close: livePrice };
      lastCandleRef.current = fresh;
      candlesRef.current = [...candlesRef.current, fresh];
      series.update(fresh as any);
    } else {
      const merged: Candle = {
        time: last.time,
        open: last.open,
        high: Math.max(last.high, livePrice),
        low: Math.min(last.low, livePrice),
        close: livePrice,
      };
      lastCandleRef.current = merged;
      candlesRef.current = [...candlesRef.current.slice(0, -1), merged];
      series.update(merged as any);
    }
  }, [livePrice, bucket]);

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center gap-4 flex-wrap pb-2 text-[10px] uppercase tracking-[0.22em]">
        <div className="flex items-center gap-1">
          <span className="text-muted mr-1">TF</span>
          {RESOLUTIONS.map((r) => (
            <button
              key={r.key}
              onClick={() => setResolution(r.key)}
              className={`px-2 py-1 border transition-colors ${
                resolution === r.key ? 'border-brass text-brass-bright bg-brass/5' : 'border-rule text-dim hover:text-ivory hover:border-brass/40'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
        <div className="h-4 w-px bg-rule" />
        <div className="flex items-center gap-1">
          <span className="text-muted mr-1">IND</span>
          <button
            onClick={() => setShowSMA((v) => !v)}
            className={`px-2 py-1 border transition-colors ${showSMA ? 'border-brass text-brass-bright bg-brass/5' : 'border-rule text-dim hover:text-ivory hover:border-brass/40'}`}
          >
            SMA 20
          </button>
          <button
            onClick={() => setShowEMA((v) => !v)}
            className={`px-2 py-1 border transition-colors ${showEMA ? 'border-verdigris text-verdigris bg-verdigris/5' : 'border-rule text-dim hover:text-ivory hover:border-verdigris/60'}`}
          >
            EMA 50
          </button>
        </div>
        <div className="h-4 w-px bg-rule" />
        <div className="flex items-center gap-1">
          <span className="text-muted mr-1">Draw</span>
          <button
            onClick={() => setAddingAlert((v) => !v)}
            className={`px-2 py-1 border transition-colors ${addingAlert ? 'border-brass text-brass-bright bg-brass/5' : 'border-rule text-dim hover:text-ivory hover:border-brass/40'}`}
          >
            + Alert Line
          </button>
          <button
            onClick={() => setAlertLines([])}
            disabled={alertLines.length === 0}
            className="px-2 py-1 border border-rule text-dim hover:text-descend hover:border-descend/40 disabled:opacity-30 transition-colors"
          >
            Clear
          </button>
          {addingAlert && <span className="text-brass-bright normal-case ml-2">click anywhere on the chart…</span>}
        </div>
      </div>

      <div className="topo-frame relative border border-rule overflow-hidden" style={{ height }}>
        <div className="absolute top-2 left-2 w-6 h-6 border-l border-t border-brass/60 pointer-events-none z-20" />
        <div className="absolute top-2 right-2 w-6 h-6 border-r border-t border-brass/60 pointer-events-none z-20" />
        <div className="absolute bottom-2 left-2 w-6 h-6 border-l border-b border-brass/60 pointer-events-none z-20" />
        <div className="absolute bottom-2 right-2 w-6 h-6 border-r border-b border-brass/60 pointer-events-none z-20" />
        <div ref={containerRef} className={`h-full w-full relative z-10 ${addingAlert ? 'cursor-crosshair' : ''}`} />
      </div>
    </div>
  );
}
