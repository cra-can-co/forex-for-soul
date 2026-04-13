import { useMemo } from 'react';
import { useConnection, useAnchorWallet } from '@solana/wallet-adapter-react';
import { AnchorProvider, Program } from '@coral-xyz/anchor';
import { PublicKey, Keypair } from '@solana/web3.js';
import idl from '../idl.json';
import { PROGRAM_ID } from './constants';

function toBytes(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

export function useProgram() {
  const { connection } = useConnection();
  const wallet = useAnchorWallet();

  const provider = useMemo(() => {
    if (!wallet) return null;
    return new AnchorProvider(connection, wallet, {
      commitment: 'confirmed',
    });
  }, [connection, wallet]);

  const program = useMemo(() => {
    if (!provider) return null;
    return new Program(idl as any, provider);
  }, [provider]);

  return { program, provider, connection };
}

export function useReadonlyProgram() {
  const { connection } = useConnection();

  const program = useMemo(() => {
    // create a dummy wallet for read-only access
    const dummyKeypair = Keypair.generate();
    const dummyWallet = {
      publicKey: dummyKeypair.publicKey,
      signTransaction: async (tx: any) => tx,
      signAllTransactions: async (txs: any) => txs,
    };
    const provider = new AnchorProvider(connection, dummyWallet as any, {
      commitment: 'confirmed',
    });
    return new Program(idl as any, provider);
  }, [connection]);

  return { program, connection };
}

export function getExchangePDA(): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [toBytes('exchange')],
    PROGRAM_ID
  );
  return pda;
}

export function getPairPDA(base: string, quote: string): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [toBytes('pair'), toBytes(base), toBytes(quote)],
    PROGRAM_ID
  );
  return pda;
}

export function getPositionPDA(trader: PublicKey, pair: PublicKey, positionId: number): PublicKey {
  const buf = new Uint8Array(8);
  const view = new DataView(buf.buffer);
  view.setBigUint64(0, BigInt(positionId), true);
  const [pda] = PublicKey.findProgramAddressSync(
    [toBytes('position'), trader.toBytes(), pair.toBytes(), buf],
    PROGRAM_ID
  );
  return pda;
}
