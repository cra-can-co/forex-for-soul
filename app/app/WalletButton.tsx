'use client';

import dynamic from 'next/dynamic';

const WalletMultiButton = dynamic(
  () => import('@solana/wallet-adapter-react-ui').then(m => m.WalletMultiButton),
  { ssr: false }
);

export function WalletButton() {
  return (
    <WalletMultiButton
      style={{
        backgroundColor: '#1a1e26',
        border: '1px solid #2a2e36',
        borderRadius: '4px',
        fontSize: '12px',
        height: '32px',
        padding: '0 16px',
        fontFamily: 'Roboto Mono, monospace',
      }}
    />
  );
}
