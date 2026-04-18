/**
 * Pyth → on-chain price crank.
 *
 * Polls Pyth Hermes every POLL_MS and calls `update_price` for each of the
 * 4 FX pairs. Run it in the background before trading so the contract's
 * 60s staleness check passes.
 *
 *   ts-node scripts/push-prices.ts
 */

import * as anchor from '@coral-xyz/anchor';
import { PublicKey, Keypair, Connection } from '@solana/web3.js';
import fs from 'fs';
import path from 'path';

const IDL = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../target/idl/forexforsoul.json'), 'utf8'),
);
const PROGRAM_ID = new PublicKey(IDL.address);

const HERMES = 'https://hermes.pyth.network/v2/updates/price/latest';
const POLL_MS = 8_000;

interface PairSpec {
  base: string;
  quote: string;
  pythId: string;          // hex (no 0x) Pyth feed ID
  onChainExponent: 8;      // contract stores price as integer * 1e-8
}

const PAIRS: PairSpec[] = [
  { base: 'EUR', quote: 'USD', pythId: 'a995d00bb36a63cef7fd2c287dc105fc8f3d93779f062f09551b0af3e81ec30b', onChainExponent: 8 },
  { base: 'GBP', quote: 'USD', pythId: '84c2dde9633d93d1bcad84e7dc41c9d56578b7ec52fabedc1f335d673df0a7c1', onChainExponent: 8 },
  { base: 'USD', quote: 'JPY', pythId: 'ef2c98c804ba503c6a707e38be4dfbb16683775f195b091252bf24693042fd52', onChainExponent: 8 },
  { base: 'AUD', quote: 'USD', pythId: '67a6f93030420c1c9e3fe37c1ab6b77966af82f995944a9fefce357a22854a80', onChainExponent: 8 },
];

function scaleToOnChain(priceStr: string, expo: number, targetExpo: number): bigint {
  // Human value = raw * 10^expo. We want intPrice such that intPrice * 10^targetExpo == human value,
  // so intPrice = raw * 10^(expo - targetExpo).
  // Pyth returns expo = -5 for most FX; contract expects 1e-8 integers ⇒ targetExpo = -8,
  // giving diff = -5 - (-8) = +3, i.e. multiply the raw int by 1000.
  const raw = BigInt(priceStr);
  const diff = expo - targetExpo;
  if (diff >= 0) return raw * (10n ** BigInt(diff));
  return raw / (10n ** BigInt(-diff));
}

async function fetchPythPrices(): Promise<Map<string, bigint>> {
  const query = PAIRS.map((p) => `ids[]=${p.pythId}`).join('&');
  const res = await fetch(`${HERMES}?${query}&parsed=true`);
  if (!res.ok) throw new Error(`hermes ${res.status}`);
  const body: any = await res.json();
  const out = new Map<string, bigint>();
  for (const entry of body.parsed ?? []) {
    const pair = PAIRS.find((p) => p.pythId === entry.id);
    if (!pair) continue;
    const scaled = scaleToOnChain(entry.price.price, entry.price.expo, -pair.onChainExponent);
    out.set(`${pair.base}/${pair.quote}`, scaled);
  }
  return out;
}

async function main() {
  const connection = new Connection('https://api.devnet.solana.com', 'confirmed');

  const walletPath = path.join(__dirname, '../deploy-keypair.json');
  const authority = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(walletPath, 'utf8'))),
  );
  console.log(`[crank] authority ${authority.publicKey.toBase58()}`);
  const balance = (await connection.getBalance(authority.publicKey)) / 1e9;
  console.log(`[crank] balance ${balance.toFixed(3)} SOL`);
  if (balance < 0.1) console.warn('[crank] low balance — airdrop may be needed');

  const wallet = new anchor.Wallet(authority);
  const provider = new anchor.AnchorProvider(connection, wallet, { commitment: 'confirmed' });
  const program = new anchor.Program(IDL, provider);

  const [exchangePDA] = PublicKey.findProgramAddressSync([Buffer.from('exchange_v2')], PROGRAM_ID);

  const pairPdas = new Map<string, PublicKey>();
  for (const p of PAIRS) {
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from('pair_v2'), Buffer.from(p.base), Buffer.from(p.quote)],
      PROGRAM_ID,
    );
    pairPdas.set(`${p.base}/${p.quote}`, pda);
  }

  async function tick() {
    let prices: Map<string, bigint>;
    try {
      prices = await fetchPythPrices();
    } catch (exc) {
      console.error(`[crank] pyth fetch error: ${exc}`);
      return;
    }

    for (const p of PAIRS) {
      const key = `${p.base}/${p.quote}`;
      const scaled = prices.get(key);
      if (scaled == null) continue;
      const pda = pairPdas.get(key)!;
      try {
        const tx = await (program.methods as any)
          .updatePrice(new anchor.BN(scaled.toString()))
          .accountsPartial({
            exchange: exchangePDA,
            pair: pda,
            authority: authority.publicKey,
          })
          .rpc({ skipPreflight: true, commitment: 'confirmed' });
        const human = Number(scaled) / 1e8;
        console.log(`[${new Date().toISOString().slice(11, 19)}] ${key.padEnd(7)} ${human.toFixed(5).padStart(9)}  ${tx.slice(0, 16)}…`);
      } catch (exc: any) {
        console.error(`[crank] ${key} update failed: ${String(exc).slice(0, 140)}`);
      }
    }
  }

  await tick();
  setInterval(() => void tick(), POLL_MS);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
