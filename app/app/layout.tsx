import './globals.css';
import Link from 'next/link';
import { SolanaProviders } from './providers';
import { WalletPill } from './WalletPill';

export const metadata = {
  title: 'Forex for Soul — Night Desk',
  description: 'A mystic trading desk for decentralised FX perpetuals on Solana. Live Pyth quotes. Real TradingView charts. Devnet-settled positions.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-ink text-ivory">
        <SolanaProviders>
          <header className="relative z-20 border-b border-rule bg-ink/80 backdrop-blur">
            <div className="flex items-center gap-8 h-16 px-6">
              <div className="flex items-baseline gap-3">
                <span className="font-display italic text-brass-bright text-xl leading-none">forex</span>
                <span className="text-brass/60 font-display italic">for</span>
                <span className="font-display text-ivory text-xl leading-none tracking-tight">soul</span>
                <span className="ml-2 text-[9px] tracking-[0.32em] uppercase text-dim border border-rule px-1.5 py-0.5">
                  Night Desk · Devnet
                </span>
              </div>
              <nav className="flex items-center gap-1 ml-4">
                <NavLink href="/" label="Desk" />
                <NavLink href="/positions" label="Ledger" />
                <NavLink href="/pool" label="Vault" />
                <NavLink href="/points" label="Points" />
              </nav>
              <div className="ml-auto flex items-center gap-3">
                <span className="hidden md:inline-flex items-center gap-2 text-[10px] tracking-[0.28em] uppercase text-dim">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-ascend animate-pulse" />
                  Pyth Hermes · Live
                </span>
                <WalletPill />
              </div>
            </div>
            <div className="hr-brass" />
          </header>
          <main>{children}</main>
        </SolanaProviders>
      </body>
    </html>
  );
}

function NavLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="px-3 py-1.5 text-[12px] tracking-[0.22em] uppercase text-dim hover:text-brass-bright transition-colors"
    >
      {label}
    </Link>
  );
}
