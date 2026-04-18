/**
 * v2 bootstrap:
 *   1. Create a mock USDC SPL mint (6 decimals) owned by the deploy keypair.
 *   2. Call initialize_exchange(usdc_mint) — creates Exchange v2 PDA, Pool v2,
 *      and the vault ATA owned by the Exchange PDA.
 *   3. Add the four FX pairs.
 *   4. Push an initial Pyth price to each.
 *
 * Idempotent — each step is skipped if the target account already exists.
 */

import * as anchor from '@coral-xyz/anchor';
import { PublicKey, Keypair, Connection, SystemProgram, SYSVAR_RENT_PUBKEY } from '@solana/web3.js';
import {
  createMint,
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import fs from 'fs';
import path from 'path';

const IDL = JSON.parse(fs.readFileSync(path.join(__dirname, '../target/idl/forexforsoul.json'), 'utf8'));
const PROGRAM_ID = new PublicKey(IDL.address);

const MINT_CACHE = path.join(__dirname, '..', 'mock-usdc-mint.json');

const PAIRS = [
  { base: 'EUR', quote: 'USD', maxLeverage: 20, spreadBps: 8,  seedPrice: 117_636_000 },  // 1.17636
  { base: 'GBP', quote: 'USD', maxLeverage: 20, spreadBps: 11, seedPrice: 135_170_000 },  // 1.35170
  { base: 'USD', quote: 'JPY', maxLeverage: 20, spreadBps: 9,  seedPrice: 15_861_500_000 }, // 158.615
  { base: 'AUD', quote: 'USD', maxLeverage: 20, spreadBps: 12, seedPrice: 71_693_000 },   // 0.71693
];

async function main() {
  const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
  const authority = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(path.join(__dirname, '../deploy-keypair.json'), 'utf8'))),
  );
  console.log(`[init-v2] authority ${authority.publicKey.toBase58()}`);
  console.log(`[init-v2] balance ${(await connection.getBalance(authority.publicKey)) / 1e9} SOL`);

  const wallet = new anchor.Wallet(authority);
  const provider = new anchor.AnchorProvider(connection, wallet, { commitment: 'confirmed' });
  anchor.setProvider(provider);
  const program = new anchor.Program(IDL, provider);

  // ── 1. Mock USDC mint ─────────────────────────────────────────────────
  let usdcMint: PublicKey;
  if (fs.existsSync(MINT_CACHE)) {
    usdcMint = new PublicKey(JSON.parse(fs.readFileSync(MINT_CACHE, 'utf8')).mint);
    console.log(`[init-v2] mint cached: ${usdcMint.toBase58()}`);
  } else {
    usdcMint = await createMint(
      connection,
      authority,                  // fee payer + signer
      authority.publicKey,        // mint authority — we keep so the faucet can mint
      null,                       // no freeze authority
      6,                          // USDC has 6 decimals
    );
    fs.writeFileSync(MINT_CACHE, JSON.stringify({ mint: usdcMint.toBase58() }, null, 2));
    console.log(`[init-v2] mint created: ${usdcMint.toBase58()}`);
  }

  // ── 2. Derive PDAs ───────────────────────────────────────────────────
  const [exchangePda] = PublicKey.findProgramAddressSync([Buffer.from('exchange_v2')], PROGRAM_ID);
  const [poolPda] = PublicKey.findProgramAddressSync([Buffer.from('lp_pool_v2')], PROGRAM_ID);
  const vaultAta = getAssociatedTokenAddressSync(usdcMint, exchangePda, true);

  console.log(`[init-v2] exchange PDA  ${exchangePda.toBase58()}`);
  console.log(`[init-v2] pool PDA      ${poolPda.toBase58()}`);
  console.log(`[init-v2] vault ATA     ${vaultAta.toBase58()}`);

  // ── 3. initialize_exchange ────────────────────────────────────────────
  const exAcc = await connection.getAccountInfo(exchangePda);
  if (exAcc) {
    console.log('[init-v2] exchange already initialised, skipping');
  } else {
    const sig = await (program.methods as any)
      .initializeExchange()
      .accountsPartial({
        exchange: exchangePda,
        pool: poolPda,
        usdcMint,
        vault: vaultAta,
        authority: authority.publicKey,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .rpc();
    console.log(`[init-v2] initialize_exchange → ${sig}`);
  }

  // ── 4. Add pairs ──────────────────────────────────────────────────────
  for (const p of PAIRS) {
    const [pairPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('pair_v2'), Buffer.from(p.base), Buffer.from(p.quote)],
      PROGRAM_ID,
    );
    const existing = await connection.getAccountInfo(pairPda);
    if (existing) {
      console.log(`[init-v2] pair ${p.base}/${p.quote} exists`);
      continue;
    }
    const sig = await (program.methods as any)
      .addTradingPair(p.base, p.quote, p.maxLeverage, p.spreadBps)
      .accountsPartial({
        exchange: exchangePda,
        pair: pairPda,
        authority: authority.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    console.log(`[init-v2] add ${p.base}/${p.quote} → ${sig}`);
  }

  // ── 5. Seed an initial price so the UI isn't blank until the crank runs ─
  for (const p of PAIRS) {
    const [pairPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('pair_v2'), Buffer.from(p.base), Buffer.from(p.quote)],
      PROGRAM_ID,
    );
    try {
      const sig = await (program.methods as any)
        .updatePrice(new anchor.BN(p.seedPrice))
        .accountsPartial({
          exchange: exchangePda,
          pair: pairPda,
          authority: authority.publicKey,
        })
        .rpc();
      console.log(`[init-v2] seed ${p.base}/${p.quote} @ ${p.seedPrice / 1e8} → ${sig}`);
    } catch (e: any) {
      console.error(`[init-v2] seed price failed for ${p.base}/${p.quote}:`, e.message ?? e);
    }
  }

  console.log('[init-v2] done.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
