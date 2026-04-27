import { PublicKey } from '@solana/web3.js';

export const PROGRAM_ID = new PublicKey('ERSbyEx6s4MJnAem1vjmZW8Wv2cQdx1U4Fytuo6qy8ro');

// Mock-USDC mint minted by the deploy keypair (devnet only).
export const USDC_MINT = new PublicKey('6AjMtKzpBRzMwiEnHR89Suqfh3AcapQaceCRvUPVuMSF');
export const USDC_DECIMALS = 6;

// v2 seeds — economic model rewrite.
export const EXCHANGE_SEED = Buffer.from('exchange_v2');
export const PAIR_SEED = Buffer.from('pair_v2');
export const POSITION_SEED = Buffer.from('position_v2');
export const POOL_SEED = Buffer.from('lp_pool_v2');

export const PRICE_DECIMALS = 100_000_000;

// Pyth Hermes FX feed IDs (mainnet price catalogue).
// Verified against https://hermes.pyth.network/v2/price_feeds?asset_type=fx
export const PAIRS_CONFIG = [
  {
    base: 'EUR',
    quote: 'USD',
    tvSymbol: 'FX:EURUSD',
    pythId: 'a995d00bb36a63cef7fd2c287dc105fc8f3d93779f062f09551b0af3e81ec30b',
    precision: 5,
    displayPrice: 1.0842,
    glyph: '€',
    mythos: 'AURELIUS',
  },
  {
    base: 'GBP',
    quote: 'USD',
    tvSymbol: 'FX:GBPUSD',
    pythId: '84c2dde9633d93d1bcad84e7dc41c9d56578b7ec52fabedc1f335d673df0a7c1',
    precision: 5,
    displayPrice: 1.2651,
    glyph: '£',
    mythos: 'ALBION',
  },
  {
    base: 'USD',
    quote: 'JPY',
    tvSymbol: 'FX:USDJPY',
    pythId: 'ef2c98c804ba503c6a707e38be4dfbb16683775f195b091252bf24693042fd52',
    precision: 3,
    displayPrice: 157.32,
    glyph: '¥',
    mythos: 'ORIENS',
  },
  {
    base: 'AUD',
    quote: 'USD',
    tvSymbol: 'FX:AUDUSD',
    pythId: '67a6f93030420c1c9e3fe37c1ab6b77966af82f995944a9fefce357a22854a80',
    precision: 5,
    displayPrice: 0.6534,
    glyph: '$',
    mythos: 'AUSTRALIS',
  },
];

export const PYTH_HERMES_BASE = 'https://hermes.pyth.network/v2';
