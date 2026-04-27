// USDC faucet — server-side Next route handler. The deploy keypair is the
// mint authority; this endpoint is the only place it touches the browser.
//
// POST { wallet: string }  →  { sig: string, amount: number }

import { NextResponse } from 'next/server';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createMintToInstruction,
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { Transaction } from '@solana/web3.js';
import fs from 'node:fs';
import path from 'node:path';

const FAUCET_AMOUNT = 10_000 * 1_000_000; // 10 000 USDC (6 decimals)
const COOLDOWN_MS = 60_000;

// Per-IP in-memory cooldown — the dev server is single-process so this is fine
// for a Tier-3 demo. A production faucet would need Redis or equivalent.
const lastCall = new Map<string, number>();

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body.wallet !== 'string') {
      return NextResponse.json({ error: 'Missing wallet address' }, { status: 400 });
    }
    let recipient: PublicKey;
    try {
      recipient = new PublicKey(body.wallet);
    } catch {
      return NextResponse.json({ error: 'Invalid wallet address' }, { status: 400 });
    }

    const clientId = req.headers.get('x-forwarded-for')?.split(',')[0].trim()
      || req.headers.get('x-real-ip')
      || body.wallet;
    const last = lastCall.get(clientId) ?? 0;
    if (Date.now() - last < COOLDOWN_MS) {
      const secs = Math.ceil((COOLDOWN_MS - (Date.now() - last)) / 1000);
      return NextResponse.json({ error: `Cooldown — ${secs}s` }, { status: 429 });
    }

    // Resolve paths relative to the project root (one level up from app/).
    const projectRoot = path.resolve(process.cwd(), '..');
    const keypairPath = path.join(projectRoot, 'deploy-keypair.json');
    const mintCachePath = path.join(projectRoot, 'mock-usdc-mint.json');

    const authority = Keypair.fromSecretKey(
      Uint8Array.from(JSON.parse(fs.readFileSync(keypairPath, 'utf8'))),
    );
    const usdcMint = new PublicKey(
      JSON.parse(fs.readFileSync(mintCachePath, 'utf8')).mint,
    );

    const conn = new Connection('https://api.devnet.solana.com', 'confirmed');
    const recipientAta = getAssociatedTokenAddressSync(usdcMint, recipient);

    const tx = new Transaction();
    tx.add(
      createAssociatedTokenAccountIdempotentInstruction(
        authority.publicKey,
        recipientAta,
        recipient,
        usdcMint,
      ),
      createMintToInstruction(
        usdcMint,
        recipientAta,
        authority.publicKey,
        FAUCET_AMOUNT,
        [],
        TOKEN_PROGRAM_ID,
      ),
    );

    const sig = await conn.sendTransaction(tx, [authority], { skipPreflight: false });
    await conn.confirmTransaction(sig, 'confirmed');

    lastCall.set(clientId, Date.now());
    return NextResponse.json({
      sig,
      amount: FAUCET_AMOUNT / 1_000_000,
      mint: usdcMint.toBase58(),
      ata: recipientAta.toBase58(),
    });
  } catch (exc: any) {
    return NextResponse.json({ error: String(exc?.message ?? exc).slice(0, 240) }, { status: 500 });
  }
}
