import './globals.css';
import Link from 'next/link';
import { SolanaProviders } from './providers';
import { WalletButton } from './WalletButton';

export const metadata = {
  title: 'Forex for Soul',
  description: 'Decentralized Forex perpetuals on Solana',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <SolanaProviders>
          <header className="bg-panel border-b border-border h-12 flex items-center px-4 sticky top-0 z-50">
            <div className="flex items-center gap-6 w-full">
              <h1 className="text-sm font-bold tracking-wider">
                FOREX<span className="text-long">4</span>SOUL
              </h1>
              <nav className="flex gap-1 text-xs">
                <Link href="/" className="px-3 py-1.5 text-gray-400 hover:text-white rounded hover:bg-white/5">Trade</Link>
                <Link href="/positions" className="px-3 py-1.5 text-gray-400 hover:text-white rounded hover:bg-white/5">Positions</Link>
                <Link href="/pool" className="px-3 py-1.5 text-gray-400 hover:text-white rounded hover:bg-white/5">LP Pool</Link>
              </nav>
              <div className="ml-auto">
                <WalletButton />
              </div>
            </div>
          </header>
          <main>{children}</main>
        </SolanaProviders>
      </body>
    </html>
  );
}
