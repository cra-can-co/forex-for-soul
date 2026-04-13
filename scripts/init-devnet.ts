import * as anchor from '@coral-xyz/anchor';
import { PublicKey, Keypair, Connection } from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';

const IDL = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../target/idl/forexforsoul.json'), 'utf8')
);

const PROGRAM_ID = new PublicKey(IDL.address);

const PAIRS = [
  { base: 'EUR', quote: 'USD', maxLeverage: 20, spreadBps: 8, price: 108_420_000 },   // 1.0842
  { base: 'GBP', quote: 'USD', maxLeverage: 20, spreadBps: 11, price: 126_510_000 },  // 1.2651
  { base: 'USD', quote: 'JPY', maxLeverage: 20, spreadBps: 9, price: 15_732_000_000 }, // 157.32
  { base: 'AUD', quote: 'USD', maxLeverage: 20, spreadBps: 12, price: 65_340_000 },    // 0.6534
];

async function main() {
  const connection = new Connection('https://api.devnet.solana.com', 'confirmed');

  const walletPath = path.join(__dirname, '../deploy-keypair.json');
  const walletKeypair = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(walletPath, 'utf8')))
  );

  console.log('Authority:', walletKeypair.publicKey.toBase58());
  console.log('Balance:', await connection.getBalance(walletKeypair.publicKey) / 1e9, 'SOL');

  const wallet = new anchor.Wallet(walletKeypair);
  const provider = new anchor.AnchorProvider(connection, wallet, { commitment: 'confirmed' });
  const program = new anchor.Program(IDL, provider);

  // 1. Initialize Exchange
  const [exchangePDA] = PublicKey.findProgramAddressSync(
    [Buffer.from('exchange')],
    PROGRAM_ID
  );

  try {
    const exchangeAcc = await connection.getAccountInfo(exchangePDA);
    if (exchangeAcc) {
      console.log('Exchange already initialized:', exchangePDA.toBase58());
    } else {
      const tx = await (program.methods as any)
        .initializeExchange()
        .accountsPartial({ exchange: exchangePDA, authority: walletKeypair.publicKey })
        .rpc();
      console.log('Exchange initialized:', tx);
    }
  } catch (err: any) {
    if (err.message?.includes('already in use')) {
      console.log('Exchange already exists');
    } else {
      throw err;
    }
  }

  // 2. Add Trading Pairs
  for (const pair of PAIRS) {
    const [pairPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from('pair'), Buffer.from(pair.base), Buffer.from(pair.quote)],
      PROGRAM_ID
    );

    try {
      const pairAcc = await connection.getAccountInfo(pairPDA);
      if (pairAcc) {
        console.log(`Pair ${pair.base}/${pair.quote} already exists:`, pairPDA.toBase58());
      } else {
        const tx = await (program.methods as any)
          .addTradingPair(pair.base, pair.quote, pair.maxLeverage, pair.spreadBps)
          .accountsPartial({ exchange: exchangePDA, pair: pairPDA, authority: walletKeypair.publicKey })
          .rpc();
        console.log(`Pair ${pair.base}/${pair.quote} created:`, tx);
      }
    } catch (err: any) {
      if (err.message?.includes('already in use')) {
        console.log(`Pair ${pair.base}/${pair.quote} already exists`);
      } else {
        console.error(`Failed to create ${pair.base}/${pair.quote}:`, err.message);
      }
    }
  }

  // 3. Update Prices
  for (const pair of PAIRS) {
    const [pairPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from('pair'), Buffer.from(pair.base), Buffer.from(pair.quote)],
      PROGRAM_ID
    );

    try {
      const tx = await (program.methods as any)
        .updatePrice(new anchor.BN(pair.price))
        .accountsPartial({ exchange: exchangePDA, pair: pairPDA, authority: walletKeypair.publicKey })
        .rpc();
      console.log(`Price updated ${pair.base}/${pair.quote}: ${pair.price / 1e8} — tx: ${tx}`);
    } catch (err: any) {
      console.error(`Failed to update price ${pair.base}/${pair.quote}:`, err.message);
    }
  }

  console.log('\nDone! Exchange + 4 pairs initialized with prices.');
}

main().catch(console.error);
