/**
 * Forex for Soul — combined Railway service.
 *
 * Two responsibilities in one process:
 *   1. Pyth → on-chain price crank (every POLL_MS, push 4 FX pair prices).
 *   2. HTTP /faucet endpoint that mints mock USDC to the requester's ATA.
 *
 * The Vercel front-end rewrites /api/faucet → this service's public URL.
 */

import * as anchor from '@coral-xyz/anchor';
import { PublicKey, Keypair, Connection, Transaction } from '@solana/web3.js';
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createMintToInstruction,
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import express from 'express';
import cors from 'cors';
import idl from './idl.json';

const PORT = Number(process.env.PORT || 3010);
const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const PROGRAM_ID = new PublicKey(process.env.PROGRAM_ID || (idl as any).address);
const POLL_MS = Number(process.env.POLL_MS || 8_000);
const FAUCET_AMOUNT = Number(process.env.FAUCET_AMOUNT || 10_000) * 1_000_000; // 10k USDC, 6 decimals
const FAUCET_COOLDOWN_MS = Number(process.env.FAUCET_COOLDOWN_MS || 60_000);

const HERMES = 'https://hermes.pyth.network/v2/updates/price/latest';

interface PairSpec {
  base: string;
  quote: string;
  pythId: string;
  onChainExponent: 8;
}

const PAIRS: PairSpec[] = [
  { base: 'EUR', quote: 'USD', pythId: 'a995d00bb36a63cef7fd2c287dc105fc8f3d93779f062f09551b0af3e81ec30b', onChainExponent: 8 },
  { base: 'GBP', quote: 'USD', pythId: '84c2dde9633d93d1bcad84e7dc41c9d56578b7ec52fabedc1f335d673df0a7c1', onChainExponent: 8 },
  { base: 'USD', quote: 'JPY', pythId: 'ef2c98c804ba503c6a707e38be4dfbb16683775f195b091252bf24693042fd52', onChainExponent: 8 },
  { base: 'AUD', quote: 'USD', pythId: '67a6f93030420c1c9e3fe37c1ab6b77966af82f995944a9fefce357a22854a80', onChainExponent: 8 },
];

function parseSecret(raw: string): number[] {
  const trimmed = raw.trim();
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) return parsed;
  } catch {}
  const inner = trimmed.replace(/^[\[\(]+/, '').replace(/[\]\)]+$/, '');
  return inner.split(/[,\s]+/).filter(Boolean).map((n) => Number(n));
}

function loadAuthority(): Keypair {
  const inline = process.env.CRANK_KEYPAIR_JSON;
  if (!inline) throw new Error('CRANK_KEYPAIR_JSON env not set');
  return Keypair.fromSecretKey(Uint8Array.from(parseSecret(inline)));
}

function loadUsdcMint(): PublicKey {
  const m = process.env.MOCK_USDC_MINT;
  if (!m) throw new Error('MOCK_USDC_MINT env not set');
  return new PublicKey(m.trim());
}

function scaleToOnChain(priceStr: string, expo: number, targetExpo: number): bigint {
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

async function startCrank(authority: Keypair, connection: Connection): Promise<void> {
  console.log(`[crank] authority ${authority.publicKey.toBase58()}`);
  const balance = (await connection.getBalance(authority.publicKey)) / 1e9;
  console.log(`[crank] balance ${balance.toFixed(3)} SOL`);
  if (balance < 0.1) console.warn('[crank] low balance — airdrop needed');

  const wallet = new anchor.Wallet(authority);
  const provider = new anchor.AnchorProvider(connection, wallet, { commitment: 'confirmed' });
  const liveIdl = { ...(idl as any), address: PROGRAM_ID.toString() };
  const program = new anchor.Program(liveIdl, provider);

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
          .accountsPartial({ exchange: exchangePDA, pair: pda, authority: authority.publicKey })
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

function startServer(authority: Keypair, connection: Connection, usdcMint: PublicKey): void {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '8kb' }));

  const lastCall = new Map<string, number>();

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', authority: authority.publicKey.toBase58() });
  });

  app.post('/faucet', async (req, res) => {
    try {
      const wallet = req.body?.wallet;
      if (typeof wallet !== 'string') {
        return res.status(400).json({ error: 'Missing wallet address' });
      }
      let recipient: PublicKey;
      try { recipient = new PublicKey(wallet); } catch {
        return res.status(400).json({ error: 'Invalid wallet address' });
      }

      const ip = (req.headers['x-forwarded-for']?.toString().split(',')[0].trim()) || req.ip || wallet;
      const last = lastCall.get(ip) ?? 0;
      const since = Date.now() - last;
      if (since < FAUCET_COOLDOWN_MS) {
        const secs = Math.ceil((FAUCET_COOLDOWN_MS - since) / 1000);
        return res.status(429).json({ error: `Cooldown — ${secs}s` });
      }

      const ata = getAssociatedTokenAddressSync(usdcMint, recipient);
      const tx = new Transaction();
      tx.add(
        createAssociatedTokenAccountIdempotentInstruction(authority.publicKey, ata, recipient, usdcMint),
        createMintToInstruction(usdcMint, ata, authority.publicKey, FAUCET_AMOUNT, [], TOKEN_PROGRAM_ID),
      );
      const sig = await connection.sendTransaction(tx, [authority], { skipPreflight: false });
      await connection.confirmTransaction(sig, 'confirmed');
      lastCall.set(ip, Date.now());
      res.json({ sig, amount: FAUCET_AMOUNT / 1_000_000, mint: usdcMint.toBase58(), ata: ata.toBase58() });
    } catch (exc: any) {
      res.status(500).json({ error: String(exc?.message ?? exc).slice(0, 240) });
    }
  });

  // Vercel rewrites land on /api/faucet — accept that path too for direct testing.
  app.post('/api/faucet', (req, res, next) => {
    (app as any)._router.handle({ ...req, url: '/faucet' }, res, next);
  });

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[http] listening on :${PORT}`);
  });
}

async function main() {
  const authority = loadAuthority();
  const usdcMint = loadUsdcMint();
  const connection = new Connection(RPC_URL, 'confirmed');

  startServer(authority, connection, usdcMint);
  await startCrank(authority, connection);
}

main().catch((e) => { console.error(e); process.exit(1); });
