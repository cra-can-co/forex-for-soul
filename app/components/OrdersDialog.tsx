'use client';

import { useState, useEffect } from 'react';
import { OpenPosition } from '../app/lib/positions';
import { OrderTargets } from '../app/lib/orders';

interface Props {
  position: OpenPosition;
  currentMark: number;
  existing: OrderTargets | undefined;
  onClose: () => void;
  onSave: (targets: OrderTargets) => void;
  onClear: () => void;
}

export function OrdersDialog({ position, currentMark, existing, onClose, onSave, onClear }: Props) {
  const [sl, setSl] = useState<string>(existing?.stopLoss != null ? existing.stopLoss.toFixed(position.pairCfg.precision) : '');
  const [tp, setTp] = useState<string>(existing?.takeProfit != null ? existing.takeProfit.toFixed(position.pairCfg.precision) : '');
  const [err, setErr] = useState<string>('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  function validate(): OrderTargets | null {
    setErr('');
    const slNum = sl.trim() === '' ? null : Number(sl);
    const tpNum = tp.trim() === '' ? null : Number(tp);
    if (slNum != null && (!Number.isFinite(slNum) || slNum <= 0)) { setErr('Stop Loss invalid'); return null; }
    if (tpNum != null && (!Number.isFinite(tpNum) || tpNum <= 0)) { setErr('Take Profit invalid'); return null; }

    // For Long: SL must be below entry/mark, TP above. For Short: inverted.
    if (position.side === 'long') {
      if (slNum != null && slNum >= position.entryPrice) { setErr('SL must be below entry for Ascend'); return null; }
      if (tpNum != null && tpNum <= position.entryPrice) { setErr('TP must be above entry for Ascend'); return null; }
      if (slNum != null && slNum <= position.liquidationPrice) { setErr('SL below liquidation price'); return null; }
    } else {
      if (slNum != null && slNum <= position.entryPrice) { setErr('SL must be above entry for Descend'); return null; }
      if (tpNum != null && tpNum >= position.entryPrice) { setErr('TP must be below entry for Descend'); return null; }
      if (slNum != null && slNum >= position.liquidationPrice) { setErr('SL above liquidation price'); return null; }
    }
    return { stopLoss: slNum, takeProfit: tpNum };
  }

  const slNum = Number(sl);
  const tpNum = Number(tp);
  const slDist = sl && Number.isFinite(slNum) ? ((slNum - position.entryPrice) / position.entryPrice) * 100 * position.leverage : null;
  const tpDist = tp && Number.isFinite(tpNum) ? ((tpNum - position.entryPrice) / position.entryPrice) * 100 * position.leverage : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/80 backdrop-blur-sm" onClick={onClose}>
      <div
        className="card-brass bg-surface border border-brass/40 w-[460px] max-w-[92vw] p-6"
        style={{ borderRadius: 0 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="eyebrow">Protective Orders</div>
        <h3 className="font-display text-ivory text-2xl mt-2">
          {position.pair} · <span className={position.side === 'long' ? 'text-ascend italic' : 'text-descend italic'}>
            {position.side === 'long' ? '↑ Ascend' : '↓ Descend'}
          </span>
        </h3>

        <div className="mt-4 grid grid-cols-2 gap-4 text-[11px] font-mono">
          <Row label="Entry" value={position.entryPrice.toFixed(position.pairCfg.precision)} />
          <Row label="Mark" value={currentMark.toFixed(position.pairCfg.precision)} />
          <Row label="Liq" value={position.liquidationPrice.toFixed(position.pairCfg.precision)} tone="descend" />
          <Row label="Lev" value={`${position.leverage}x`} tone="brass" />
        </div>

        <div className="mt-6 space-y-4">
          <Field
            label="Stop Loss"
            value={sl}
            onChange={setSl}
            placeholder={position.side === 'long' ? '< entry' : '> entry'}
            hint={slDist != null ? `≈ ${slDist >= 0 ? '+' : ''}${slDist.toFixed(1)}% vs entry (with leverage)` : 'Close automatically at this price'}
            accent="amber"
          />
          <Field
            label="Take Profit"
            value={tp}
            onChange={setTp}
            placeholder={position.side === 'long' ? '> entry' : '< entry'}
            hint={tpDist != null ? `≈ ${tpDist >= 0 ? '+' : ''}${tpDist.toFixed(1)}% vs entry (with leverage)` : 'Close automatically at this price'}
            accent="ascend"
          />
        </div>

        {err && <div className="mt-4 text-[11px] text-descend border border-descend/40 px-3 py-2">{err}</div>}

        <div className="mt-6 flex gap-2 justify-end">
          <button
            onClick={() => {
              onClear();
            }}
            className="text-[11px] uppercase tracking-[0.22em] text-dim hover:text-descend border border-rule hover:border-descend/40 px-4 py-2"
          >
            Cancel Orders
          </button>
          <button
            onClick={onClose}
            className="text-[11px] uppercase tracking-[0.22em] text-dim hover:text-ivory border border-rule px-4 py-2"
          >
            Dismiss
          </button>
          <button
            onClick={() => {
              const t = validate();
              if (!t) return;
              onSave(t);
            }}
            className="text-[11px] uppercase tracking-[0.22em] text-brass-bright border border-brass hover:bg-brass/10 px-4 py-2"
          >
            Lodge Orders
          </button>
        </div>

        <div className="mt-4 text-[10px] text-muted tracking-[0.22em] uppercase">
          Orders persist in this browser and auto-fire while the desk is open.
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  hint,
  accent,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
  accent: 'amber' | 'ascend';
}) {
  const ring = accent === 'amber' ? 'focus-within:border-amber-400/80' : 'focus-within:border-ascend/80';
  return (
    <label className="block">
      <div className="text-[10px] uppercase tracking-[0.24em] text-dim mb-1">{label}</div>
      <div className={`flex items-center bg-ink border border-rule ${ring} transition-colors`}>
        <input
          type="number"
          step="any"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="flex-1 bg-transparent outline-none px-3 py-2.5 font-mono text-ivory placeholder:text-muted"
        />
        <button onClick={() => onChange('')} className="text-[10px] text-muted px-3 hover:text-ivory">clear</button>
      </div>
      {hint && <div className="mt-1 text-[10px] text-muted">{hint}</div>}
    </label>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: 'descend' | 'brass' }) {
  const color = tone === 'descend' ? 'text-descend' : tone === 'brass' ? 'text-brass' : 'text-ivory';
  return (
    <div className="flex items-center justify-between border-b border-rule/70 pb-1">
      <span className="text-dim uppercase tracking-[0.22em] text-[10px]">{label}</span>
      <span className={color}>{value}</span>
    </div>
  );
}
