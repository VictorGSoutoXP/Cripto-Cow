import { Buffer } from 'buffer';
import { api } from './api';
import type { Anchor } from '../types';

type Wallet = {
  connect: () => Promise<{ publicKey: { toString: () => string } }>;
  signTransaction: (transaction: unknown) => Promise<{ serialize: () => Uint8Array }>;
};

type Prepared = {
  id: string;
  memo: string;
  memoProgram: string;
  blockhash: string;
  lastValidBlockHeight: number;
};
type PendingAnchor = { id: string; campaignId: string; signature: string };

export async function anchorHistory(campaignId: string): Promise<Anchor> {
  const saved = sessionStorage.getItem('elo-pending-anchor');
  if (saved) {
    const pending = JSON.parse(saved) as PendingAnchor;
    if (pending.campaignId === campaignId) {
      const result = await api<Anchor>(`/anchors/${pending.id}/confirm`, {
        method: 'POST',
        body: JSON.stringify({ signature: pending.signature }),
      });
      sessionStorage.removeItem('elo-pending-anchor');
      return result;
    }
  }
  const scope = window as unknown as { phantom?: { solana?: Wallet }; solana?: Wallet };
  const provider = scope.phantom?.solana ?? scope.solana;
  if (!provider)
    throw new Error(
      'Abra em um navegador com a carteira Phantom instalada. Use uma carteira de testes com SOL de devnet.',
    );
  const { publicKey } = await provider.connect();
  const prepared = await api<Prepared>(`/campaigns/${campaignId}/anchors/prepare`, {
    method: 'POST',
    body: JSON.stringify({ wallet: publicKey.toString() }),
  });
  const { Transaction, TransactionInstruction, PublicKey } = await import('@solana/web3.js');
  const transaction = new Transaction({
    feePayer: new PublicKey(publicKey.toString()),
    recentBlockhash: prepared.blockhash,
  }).add(
    new TransactionInstruction({
      programId: new PublicKey(prepared.memoProgram),
      keys: [{ pubkey: new PublicKey(publicKey.toString()), isSigner: true, isWritable: false }],
      data: Buffer.from(prepared.memo, 'utf8'),
    }),
  );
  const signed = await provider.signTransaction(transaction);
  const { signature } = await api<{ signature: string }>(`/anchors/${prepared.id}/submit`, {
    method: 'POST',
    body: JSON.stringify({ transaction: Buffer.from(signed.serialize()).toString('base64') }),
  });
  sessionStorage.setItem(
    'elo-pending-anchor',
    JSON.stringify({ id: prepared.id, campaignId, signature }),
  );
  for (let attempt = 0; attempt < 8; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1800));
    try {
      const result = await api<Anchor>(`/anchors/${prepared.id}/confirm`, {
        method: 'POST',
        body: JSON.stringify({ signature }),
      });
      sessionStorage.removeItem('elo-pending-anchor');
      return result;
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes('ainda não foi confirmada'))
        throw error;
    }
  }
  throw new Error(
    'Transação enviada. Aguarde alguns segundos e clique novamente para confirmar o registro.',
  );
}
