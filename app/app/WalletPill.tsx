'use client';

import dynamic from 'next/dynamic';

const WalletMultiButton = dynamic(
  () => import('@solana/wallet-adapter-react-ui').then((m) => m.WalletMultiButton),
  { ssr: false },
);

// Styling is centralised in globals.css via the .wallet-adapter-button-trigger selector
// so the header renders consistently even before the dynamic chunk loads.
export function WalletPill() {
  return <WalletMultiButton />;
}
