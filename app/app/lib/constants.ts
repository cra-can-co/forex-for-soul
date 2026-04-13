import { PublicKey } from '@solana/web3.js';

export const PROGRAM_ID = new PublicKey('ERSbyEx6s4MJnAem1vjmZW8Wv2cQdx1U4Fytuo6qy8ro');

export const EXCHANGE_SEED = Buffer.from('exchange');
export const PAIR_SEED = Buffer.from('pair');
export const POSITION_SEED = Buffer.from('position');

export const PRICE_DECIMALS = 100_000_000;

export const PAIRS_CONFIG = [
  { base: 'EUR', quote: 'USD', displayPrice: 1.0842 },
  { base: 'GBP', quote: 'USD', displayPrice: 1.2651 },
  { base: 'USD', quote: 'JPY', displayPrice: 157.32 },
  { base: 'AUD', quote: 'USD', displayPrice: 0.6534 },
];
