'use client';

import { useState } from 'react';
import { usePoints } from '../lib/points';

export default function VaultPage() {
  const [amount, setAmount] = useState('');
  const [mode, setMode] = useState<'deposit' | 'withdraw'>('deposit');
  const { award } = usePoints();
  const [flash, setFlash] = useState<string | null>(null);

  // Per-day / per-wallet soft cap so the demo-only vault can't be farmed for
  // unlimited points by spamming the button.
  const DAILY_POINT_CAP = 2000;

  function handleAction() {
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setFlash('Enter a positive amount.');
      setTimeout(() => setFlash(null), 3000);
      return;
    }
    if (mode === 'deposit') {
      const today = new Date().toISOString().slice(0, 10);
      const cacheKey = `forex4soul.vault-demo.${today}`;
      const granted = typeof window !== 'undefined' ? Number(window.localStorage.getItem(cacheKey) ?? 0) : 0;
      const request = Math.round(amt);
      const room = Math.max(0, DAILY_POINT_CAP - granted);
      const give = Math.min(request, room);
      if (give > 0) {
        award('vault-deposit', give, { amount: amt });
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(cacheKey, String(granted + give));
        }
        setFlash(`Provisioned demo deposit: +${give} pts${give < request ? ` (daily cap reached, ${room === 0 ? 'nothing' : room + ' pts'} left)` : ''}.`);
      } else {
        setFlash(`Daily demo cap (${DAILY_POINT_CAP} pts) reached. Try tomorrow.`);
      }
    } else {
      setFlash('Withdraw demo — on-chain LP wiring deferred until USDC vault lands.');
    }
    setAmount('');
    setTimeout(() => setFlash(null), 5000);
  }

  const vault = {
    tvl: 245_000,
    utilisation: 68.4,
    apr: 12.5,
    longOI: 142_800,
    shortOI: 108_300,
  };

  return (
    <div className="px-6 pt-10 pb-20">
      <div className="eyebrow">The Vault ✦ Folio III</div>
      <h1 className="font-display text-ivory mt-3 text-4xl tracking-tight max-w-3xl">
        Provide liquidity. Earn brass while the desk trades.
      </h1>
      <p className="text-dim mt-2 text-sm max-w-xl">
        Deposit stablecoin into the shared counter-party. Your share accrues fees, funding, and the
        net of winning and losing ledgers.
      </p>

      <div className="mt-10 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_480px] gap-px bg-rule border border-rule">
        {/* Metrics */}
        <div className="bg-ink p-6">
          <div className="grid grid-cols-3 gap-px bg-rule border border-rule">
            <VaultStat label="TVL" value={`$${vault.tvl.toLocaleString()}`} tone="ivory" />
            <VaultStat label="Utilisation" value={`${vault.utilisation.toFixed(1)}%`} tone="brass" />
            <VaultStat label="APR" value={`${vault.apr.toFixed(1)}%`} tone="ascend" />
          </div>

          {/* Utilisation bar */}
          <div className="mt-8">
            <div className="flex justify-between text-[10px] tracking-[0.24em] uppercase text-dim mb-2">
              <span>Long OI</span>
              <span>Short OI</span>
            </div>
            <div className="relative h-2 bg-surface-raised border border-rule">
              <div className="absolute inset-y-0 left-0 bg-ascend/60" style={{ width: `${(vault.longOI / (vault.longOI + vault.shortOI)) * 100}%` }} />
              <div className="absolute inset-y-0 right-0 bg-descend/60" style={{ width: `${(vault.shortOI / (vault.longOI + vault.shortOI)) * 100}%` }} />
            </div>
            <div className="flex justify-between text-[11px] font-mono text-dim mt-2">
              <span className="text-ascend">${vault.longOI.toLocaleString()}</span>
              <span className="text-descend">${vault.shortOI.toLocaleString()}</span>
            </div>
          </div>

          {/* Folio notes */}
          <div className="mt-10 border-t border-rule pt-6 space-y-5">
            <Note title="I — Provision" body="Deposit becomes a pro-rata claim on the vault — no lockup." />
            <Note title="II — Collect" body="Funding, spread fees, and trader P&L are all netted against your share." />
            <Note title="III — Retrieve" body="Withdraw in whole or in parts, at any hour of the night." />
          </div>
        </div>

        {/* Action panel */}
        <aside className="card-brass bg-ink p-6">
          <div className="eyebrow">Action</div>
          <div className="mt-3 grid grid-cols-2 gap-px bg-rule border border-rule">
            <button
              onClick={() => setMode('deposit')}
              className={`py-3 text-center ${mode === 'deposit' ? 'bg-ascend/10 text-ascend' : 'bg-surface text-dim hover:text-ivory'}`}
            >
              <span className="font-display italic">Provision</span>
            </button>
            <button
              onClick={() => setMode('withdraw')}
              className={`py-3 text-center ${mode === 'withdraw' ? 'bg-descend/10 text-descend' : 'bg-surface text-dim hover:text-ivory'}`}
            >
              <span className="font-display italic">Retrieve</span>
            </button>
          </div>

          <label className="block mt-6">
            <div className="text-[10px] tracking-[0.26em] uppercase text-dim mb-1.5">Amount · USDC</div>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              type="number"
              placeholder="0.00"
              className="w-full bg-surface border border-rule px-3 py-3 font-mono text-ivory text-lg outline-none focus:border-brass"
            />
          </label>

          <div className="mt-6 space-y-2 text-xs">
            <Row label="Your share" value="0 LP" />
            <Row label="Your pool value" value="$0.00" />
            <Row label="Claimable fees" value="$0.00" tone="brass" />
          </div>

          <button
            onClick={handleAction}
            className={`w-full mt-8 py-3 font-display italic text-lg border transition-colors ${
              mode === 'deposit'
                ? 'border-ascend/50 text-ascend hover:bg-ascend/10'
                : 'border-descend/50 text-descend hover:bg-descend/10'
            }`}
          >
            {mode === 'deposit' ? 'Provision the Vault' : 'Retrieve from Vault'}
          </button>

          {flash && (
            <div className="mt-3 text-[11px] text-center tracking-[0.22em] uppercase text-brass-bright border border-brass/30 py-2">
              {flash}
            </div>
          )}

          <div className="mt-4 text-[10px] tracking-[0.24em] uppercase text-dim text-center">
            Demo tiles — vault instructions deployed; SPL wiring coming soon. Points accrue locally.
          </div>
        </aside>
      </div>
    </div>
  );
}

function VaultStat({ label, value, tone }: { label: string; value: string; tone: 'ivory' | 'brass' | 'ascend' }) {
  const color = tone === 'brass' ? 'text-brass-bright' : tone === 'ascend' ? 'text-ascend' : 'text-ivory';
  return (
    <div className="bg-ink px-4 py-4">
      <div className="text-[10px] tracking-[0.26em] uppercase text-dim">{label}</div>
      <div className={`mt-1 font-display text-2xl ${color}`}>{value}</div>
    </div>
  );
}

function Note({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex items-start gap-4">
      <span className="font-display italic text-brass text-lg min-w-[3.5rem]">{title}</span>
      <span className="text-dim text-sm leading-relaxed">{body}</span>
    </div>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: 'brass' }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-dim text-[10px] tracking-[0.24em] uppercase">{label}</span>
      <span className={`font-mono ${tone === 'brass' ? 'text-brass-bright' : 'text-ivory'}`}>{value}</span>
    </div>
  );
}
