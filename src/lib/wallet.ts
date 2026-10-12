import { Buffer } from 'buffer';
import { api, ApiError } from './api';
import {
  confirmPendingAnchor,
  recoverPendingAnchor,
  signedAnchorSignature,
  submitPendingAnchor,
} from './anchor-pending';
import type { PendingAnchor } from './anchor-pending';
import type { Anchor, ProfileWallet, WalletChallenge } from '../types';

type Wallet = {
  publicKey?: { toString: () => string };
  connect: () => Promise<{ publicKey: { toString: () => string } }>;
  disconnect?: () => Promise<void>;
  signMessage?: (
    message: Uint8Array,
    display: 'utf8',
  ) => Promise<{ signature: Uint8Array; publicKey: { toString: () => string } }>;
  on?: (
    event: 'accountChanged' | 'disconnect',
    callback: (key?: { toString: () => string } | null) => void,
  ) => void;
  removeListener?: (
    event: 'accountChanged' | 'disconnect',
    callback: (key?: { toString: () => string } | null) => void,
  ) => void;
  signTransaction: (transaction: unknown) => Promise<{ serialize: () => Uint8Array }>;
};

export function solanaProvider(): Wallet | undefined {
  const scope = window as unknown as { phantom?: { solana?: Wallet }; solana?: Wallet };
  return scope.phantom?.solana ?? scope.solana;
}

export async function linkSolanaWallet(): Promise<ProfileWallet[]> {
  const provider = solanaProvider();
  if (!provider?.signMessage)
    throw new Error(
      'Abra no navegador da Phantom ou em um navegador com a extensão instalada e assinatura de mensagens disponível.',
    );
  const { publicKey } = await provider.connect();
  const address = publicKey.toString();
  const challenge = await api<WalletChallenge>('/profile/wallets/challenge', {
    method: 'POST',
    body: JSON.stringify({ network: 'solana', address }),
  });
  const signed = await provider.signMessage(new TextEncoder().encode(challenge.message), 'utf8');
  if (signed.publicKey.toString() !== address)
    throw new Error(
      'A conta da carteira mudou durante a assinatura. Conecte a conta desejada e tente novamente.',
    );
  const result = await api<{ wallets: ProfileWallet[] }>('/profile/wallets/confirm', {
    method: 'POST',
    body: JSON.stringify({
      id: challenge.id,
      signature: Buffer.from(signed.signature).toString('base64'),
    }),
  });
  return result.wallets;
}

type Prepared = {
  id: string;
  memo: string;
  memoProgram: string;
  blockhash: string;
  lastValidBlockHeight: number;
};
export async function anchorHistory(campaignId: string): Promise<Anchor> {
  const confirm = (pending: PendingAnchor) =>
    api<Anchor>(`/anchors/${pending.id}/confirm`, {
      method: 'POST',
      body: JSON.stringify({ signature: pending.signature }),
    });
  const recovered = await recoverPendingAnchor(sessionStorage, campaignId, confirm);
  if (recovered) return recovered;
  const provider = solanaProvider();
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
  const serialized = signed.serialize();
  const signature = await signedAnchorSignature(serialized);
  const pending = { id: prepared.id, campaignId, signature };
  await submitPendingAnchor(sessionStorage, pending, () =>
    api<{ signature: string }>(`/anchors/${prepared.id}/submit`, {
      method: 'POST',
      body: JSON.stringify({ transaction: Buffer.from(serialized).toString('base64') }),
    }),
  );
  for (let attempt = 0; attempt < 8; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1800));
    try {
      return await confirmPendingAnchor(sessionStorage, pending, confirm);
    } catch (error) {
      if (!(error instanceof ApiError) || error.code !== 'CONFIRMATION_PENDING') throw error;
    }
  }
  throw new Error(
    'Transação enviada. Aguarde alguns segundos e clique novamente para confirmar o registro.',
  );
}
