import { ApiError } from './api.ts';
import bs58 from 'bs58';

export type PendingAnchor = { id: string; campaignId: string; signature: string };

type PendingStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const legacyKey = 'elo-pending-anchor';
const terminalCodes = new Set([
  'ANCHOR_NOT_FOUND',
  'ANCHOR_HISTORY_MISMATCH',
  'ANCHOR_ALREADY_CONFIRMED',
  'TRANSACTION_FAILED',
  'TRANSACTION_MISMATCH',
  'TRANSACTION_EXPIRED',
]);

function storageKey(campaignId: string) {
  return `${legacyKey}:${encodeURIComponent(campaignId)}`;
}

function parsePending(value: string): PendingAnchor | null {
  try {
    const pending: unknown = JSON.parse(value);
    if (!pending || typeof pending !== 'object') return null;
    const fields = pending as Record<string, unknown>;
    if (
      typeof fields.id !== 'string' ||
      !/^[a-zA-Z0-9_-]{1,120}$/.test(fields.id) ||
      typeof fields.campaignId !== 'string' ||
      !/^[a-zA-Z0-9_-]{1,120}$/.test(fields.campaignId) ||
      typeof fields.signature !== 'string' ||
      !/^[1-9A-HJ-NP-Za-km-z]{80,90}$/.test(fields.signature)
    )
      return null;
    return { id: fields.id, campaignId: fields.campaignId, signature: fields.signature };
  } catch {
    return null;
  }
}

export function savePendingAnchor(storage: PendingStorage, pending: PendingAnchor) {
  if (!parsePending(JSON.stringify(pending)))
    throw new Error('Os dados da transação estão inválidos. Prepare o registro novamente.');
  storage.setItem(storageKey(pending.campaignId), JSON.stringify(pending));
}

export async function signedAnchorSignature(serialized: Uint8Array): Promise<string> {
  const { Transaction } = await import('@solana/web3.js');
  const transaction = Transaction.from(serialized);
  if (!transaction.signature || !transaction.verifySignatures())
    throw new Error('A carteira não retornou uma transação assinada válida.');
  return bs58.encode(transaction.signature);
}

export async function submitPendingAnchor(
  storage: PendingStorage,
  pending: PendingAnchor,
  submit: () => Promise<{ signature: string }>,
): Promise<void> {
  savePendingAnchor(storage, pending);
  const response = await submit();
  if (response.signature !== pending.signature)
    throw new Error(
      'A assinatura retornada pelo servidor não corresponde à transação assinada. A pendência foi preservada; clique novamente para consultar sua confirmação.',
    );
}

export function readPendingAnchor(
  storage: PendingStorage,
  campaignId: string,
): PendingAnchor | null {
  const legacy = storage.getItem(legacyKey);
  if (legacy !== null) {
    const pending = parsePending(legacy);
    if (pending) {
      const saved = storage.getItem(storageKey(pending.campaignId));
      if (saved === null) {
        savePendingAnchor(storage, pending);
        storage.removeItem(legacyKey);
      } else {
        const existing = parsePending(saved);
        if (existing?.id === pending.id && existing.signature === pending.signature)
          storage.removeItem(legacyKey);
      }
    } else {
      storage.removeItem(legacyKey);
      throw new Error(
        'A pendência salva estava inválida. Clique novamente para preparar um registro.',
      );
    }
  }
  const key = storageKey(campaignId);
  const saved = storage.getItem(key);
  if (saved === null) return null;
  const pending = parsePending(saved);
  if (!pending || pending.campaignId !== campaignId) {
    storage.removeItem(key);
    throw new Error(
      'A pendência salva estava inválida. Clique novamente para preparar um registro.',
    );
  }
  return pending;
}

export async function confirmPendingAnchor<T>(
  storage: PendingStorage,
  pending: PendingAnchor,
  confirm: (pending: PendingAnchor) => Promise<T>,
): Promise<T> {
  let result: T;
  try {
    result = await confirm(pending);
  } catch (error) {
    if (
      error instanceof ApiError &&
      [400, 404, 409, 410].includes(error.status) &&
      error.code &&
      terminalCodes.has(error.code)
    ) {
      storage.removeItem(storageKey(pending.campaignId));
      throw new Error(
        `${error.message} A pendência foi encerrada. Clique novamente para preparar um novo registro.`,
        { cause: error },
      );
    }
    throw error;
  }
  storage.removeItem(storageKey(pending.campaignId));
  return result;
}

export async function recoverPendingAnchor<T>(
  storage: PendingStorage,
  campaignId: string,
  confirm: (pending: PendingAnchor) => Promise<T>,
): Promise<T | null> {
  const pending = readPendingAnchor(storage, campaignId);
  return pending ? confirmPendingAnchor(storage, pending, confirm) : null;
}
