'use client';

import { useState } from 'react';

export default function PoolPage() {
  const [amount, setAmount] = useState('');
  const [action, setAction] = useState<'deposit' | 'withdraw'>('deposit');

  const poolStats = {
    tvl: 245000,
    utilization: 68.4,
    apr: 12.5,
    yourShares: 0,
    yourValue: 0,
  };

  return (
    <div className="max-w-xl mx-auto p-6">
      <h1 className="text-sm font-bold tracking-wider text-gray-400 mb-6">LIQUIDITY POOL</h1>

      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="bg-panel border border-border rounded p-4">
          <div className="text-[10px] text-gray-500 tracking-wider mb-1">TVL</div>
          <div className="text-lg font-bold text-white">${poolStats.tvl.toLocaleString()}</div>
        </div>
        <div className="bg-panel border border-border rounded p-4">
          <div className="text-[10px] text-gray-500 tracking-wider mb-1">UTILIZATION</div>
          <div className="text-lg font-bold text-white">{poolStats.utilization}%</div>
        </div>
        <div className="bg-panel border border-border rounded p-4">
          <div className="text-[10px] text-gray-500 tracking-wider mb-1">APR</div>
          <div className="text-lg font-bold text-long">{poolStats.apr}%</div>
        </div>
      </div>

      <div className="bg-panel border border-border rounded p-5">
        <div className="flex gap-1 mb-4">
          <button
            onClick={() => setAction('deposit')}
            className={`flex-1 py-2 text-xs font-bold rounded ${action === 'deposit' ? 'bg-long text-black' : 'bg-surface text-gray-400'}`}
          >
            Deposit
          </button>
          <button
            onClick={() => setAction('withdraw')}
            className={`flex-1 py-2 text-xs font-bold rounded ${action === 'withdraw' ? 'bg-short text-white' : 'bg-surface text-gray-400'}`}
          >
            Withdraw
          </button>
        </div>

        <div className="mb-4">
          <label className="text-xs text-gray-500 mb-1 block">Amount (USDC)</label>
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            type="number"
            placeholder="0.00"
            className="w-full bg-surface border border-border rounded px-3 py-2.5 text-sm text-white outline-none focus:border-gray-500"
          />
        </div>

        <div className="space-y-2 text-xs mb-4">
          <div className="flex justify-between">
            <span className="text-gray-500">Your LP shares</span>
            <span className="text-white">{poolStats.yourShares}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Your pool value</span>
            <span className="text-white">${poolStats.yourValue}</span>
          </div>
        </div>

        <button className={`w-full py-2.5 rounded font-bold text-sm ${action === 'deposit' ? 'bg-long text-black' : 'bg-short text-white'}`}>
          {action === 'deposit' ? 'Deposit USDC' : 'Withdraw USDC'}
        </button>
      </div>
    </div>
  );
}
