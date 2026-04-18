import { useMemo } from 'react';
import { useConnection, useAnchorWallet } from '@solana/wallet-adapter-react';
import { AnchorProvider, Program } from '@coral-xyz/anchor';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import idl from '../idl.json';
import { EXCHANGE_SEED, PAIR_SEED, POOL_SEED, POSITION_SEED, PROGRAM_ID, USDC_MINT } from './constants';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';

function createProvider(conn: Connection, signer?: any): AnchorProvider {
  // NOTE: preflight simulation is intentionally kept ON so wallet prompts surface
  // program errors (InsufficientCollateral, OracleStale, etc.) before signing.
  if (signer) return new AnchorProvider(conn, signer, { commitment: 'confirmed' });
  const ephemeral = Keypair.generate();
  return new AnchorProvider(conn, {
    publicKey: ephemeral.publicKey,
    signTransaction: async <T>(t: T) => t,
    signAllTransactions: async <T>(t: T) => t,
  } as any, { commitment: 'confirmed' });
}

export function useExchange() {
  const { connection } = useConnection();
  const wallet = useAnchorWallet();

  return useMemo(() => {
    const prov = createProvider(connection, wallet ?? undefined);
    return {
      exchange: new Program(idl as any, prov),
      canSign: !!wallet,
      connection,
    };
  }, [connection, wallet]);
}

export function getExchangePDA(): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync([EXCHANGE_SEED], PROGRAM_ID);
  return pda;
}

export function getPoolPDA(): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync([POOL_SEED], PROGRAM_ID);
  return pda;
}

export function getPairPDA(base: string, quote: string): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [PAIR_SEED, Buffer.from(base), Buffer.from(quote)],
    PROGRAM_ID,
  );
  return pda;
}

export function getPositionPDA(trader: PublicKey, pair: PublicKey, positionId: number): PublicKey {
  const buf = new Uint8Array(8);
  const view = new DataView(buf.buffer);
  view.setBigUint64(0, BigInt(positionId), true);
  const [pda] = PublicKey.findProgramAddressSync(
    [POSITION_SEED, trader.toBytes(), pair.toBytes(), buf],
    PROGRAM_ID,
  );
  return pda;
}

// Vault ATA is deterministic from the exchange PDA + USDC mint.
export function getVaultAta(): PublicKey {
  return getAssociatedTokenAddressSync(USDC_MINT, getExchangePDA(), true);
}

// User's USDC ATA.
export function getUserUsdcAta(owner: PublicKey): PublicKey {
  return getAssociatedTokenAddressSync(USDC_MINT, owner);
}
