'use client';

interface Position {
  id: string;
  pair: string;
  side: 'Long' | 'Short';
  size: number;
  leverage: number;
  entryPrice: number;
  currentPrice: number;
  pnl: number;
  pnlPercent: number;
  margin: number;
}

const demoPositions: Position[] = [
  { id: '1', pair: 'EUR/USD', side: 'Long', size: 1000, leverage: 10, entryPrice: 1.0820, currentPrice: 1.0842, pnl: 20.33, pnlPercent: 2.03, margin: 100 },
  { id: '2', pair: 'GBP/USD', side: 'Short', size: 500, leverage: 5, entryPrice: 1.2680, currentPrice: 1.2651, pnl: 11.44, pnlPercent: 1.14, margin: 100 },
  { id: '3', pair: 'USD/JPY', side: 'Long', size: 2000, leverage: 15, entryPrice: 157.10, currentPrice: 157.32, pnl: 2.80, pnlPercent: 0.21, margin: 133.33 },
];

export default function PositionsPage() {
  return (
    <div className="p-6">
      <h1 className="text-sm font-bold tracking-wider text-gray-400 mb-4">OPEN POSITIONS</h1>

      <div className="bg-panel border border-border rounded overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left px-4 py-3 text-gray-500 font-semibold">Pair</th>
              <th className="text-left px-4 py-3 text-gray-500 font-semibold">Side</th>
              <th className="text-right px-4 py-3 text-gray-500 font-semibold">Size</th>
              <th className="text-right px-4 py-3 text-gray-500 font-semibold">Leverage</th>
              <th className="text-right px-4 py-3 text-gray-500 font-semibold">Entry</th>
              <th className="text-right px-4 py-3 text-gray-500 font-semibold">Current</th>
              <th className="text-right px-4 py-3 text-gray-500 font-semibold">PnL</th>
              <th className="text-right px-4 py-3 text-gray-500 font-semibold">Margin</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {demoPositions.map((pos) => (
              <tr key={pos.id} className="border-b border-border/50 hover:bg-surface/50">
                <td className="px-4 py-3 text-white font-semibold">{pos.pair}</td>
                <td className="px-4 py-3">
                  <span className={pos.side === 'Long' ? 'text-long' : 'text-short'}>{pos.side}</span>
                </td>
                <td className="px-4 py-3 text-right text-gray-300">${pos.size}</td>
                <td className="px-4 py-3 text-right text-gray-300">{pos.leverage}x</td>
                <td className="px-4 py-3 text-right text-gray-400">{pos.entryPrice}</td>
                <td className="px-4 py-3 text-right text-white">{pos.currentPrice}</td>
                <td className="px-4 py-3 text-right">
                  <span className={pos.pnl >= 0 ? 'text-long' : 'text-short'}>
                    {pos.pnl >= 0 ? '+' : ''}{pos.pnl.toFixed(2)} ({pos.pnlPercent >= 0 ? '+' : ''}{pos.pnlPercent}%)
                  </span>
                </td>
                <td className="px-4 py-3 text-right text-gray-400">${pos.margin.toFixed(2)}</td>
                <td className="px-4 py-3 text-right">
                  <button className="text-gray-500 hover:text-short text-xs border border-border rounded px-2 py-1">Close</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
