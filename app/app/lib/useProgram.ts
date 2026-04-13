import { useMemo } from 'react';
import { useConnection, useAnchorWallet } from '@solana/wallet-adapter-react';
import { AnchorProvider, Program } from '@coral-xyz/anchor';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import idl from '../idl.json';
import { PROGRAM_ID } from './constants';

function createProvider(conn: Connection, signer?: any): AnchorProvider {
  if (signer) return new AnchorProvider(conn, signer, { commitment: 'confirmed', skipPreflight: true });
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
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('exchange')],
    PROGRAM_ID
  );
  return pda;
}

export function getPairPDA(base: string, quote: string): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('pair'), Buffer.from(base), Buffer.from(quote)],
    PROGRAM_ID
  );
  return pda;
}

export function getPositionPDA(trader: PublicKey, pair: PublicKey, positionId: number): PublicKey {
  const buf = new Uint8Array(8);
  const view = new DataView(buf.buffer);
  view.setBigUint64(0, BigInt(positionId), true);
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('position'), trader.toBytes(), pair.toBytes(), buf],
    PROGRAM_ID
  );
  return pda;
}
