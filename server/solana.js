import { Connection, PublicKey, Transaction } from '@solana/web3.js';

export const memoProgram = 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr';

export function anchorMemo(campaignId, count, root) {
  return `elo:v1:${campaignId}:${count}:${root}`;
}

export async function confirmAnchor(
  anchor,
  signature,
  rpcUrl,
  fetchTransaction,
  fetchPendingState,
) {
  const connection = new Connection(rpcUrl, 'confirmed');
  const transaction = fetchTransaction
    ? await fetchTransaction(signature)
    : await connection.getParsedTransaction(signature, {
        commitment: 'confirmed',
        maxSupportedTransactionVersion: 0,
      });
  if (!transaction) {
    if (Number.isSafeInteger(anchor.lastValidBlockHeight)) {
      const state = fetchPendingState
        ? await fetchPendingState(signature)
        : await Promise.all([
            connection.getBlockHeight('confirmed'),
            connection.getSignatureStatuses([signature], { searchTransactionHistory: true }),
          ]).then(([blockHeight, statuses]) => ({ blockHeight, status: statuses.value[0] }));
      if (state.status?.err)
        throw Object.assign(new Error('A transação falhou na Solana.'), {
          status: 400,
          code: 'TRANSACTION_FAILED',
        });
      if (state.blockHeight > anchor.lastValidBlockHeight && state.status === null)
        throw Object.assign(new Error('A transação expirou antes de ser confirmada.'), {
          status: 410,
          code: 'TRANSACTION_EXPIRED',
        });
    }
    throw Object.assign(
      new Error('A transação ainda não foi confirmada na devnet. Aguarde e tente novamente.'),
      { status: 409, code: 'CONFIRMATION_PENDING' },
    );
  }
  if (transaction.meta?.err || !transaction.meta)
    throw Object.assign(new Error('A transação falhou na Solana.'), {
      status: 400,
      code: 'TRANSACTION_FAILED',
    });
  const signer = transaction.transaction.message.accountKeys.find(
    (key) => key.signer && key.pubkey.toString() === anchor.wallet,
  );
  const memo = transaction.transaction.message.instructions.find(
    (instruction) =>
      instruction.programId.toString() === memoProgram &&
      'parsed' in instruction &&
      instruction.parsed === anchor.memo,
  );
  if (!signer || !memo)
    throw Object.assign(
      new Error('A transação não corresponde ao registro e à carteira desta solicitação.'),
      { status: 400, code: 'TRANSACTION_MISMATCH' },
    );
  return {
    signature,
    slot: transaction.slot,
    confirmedAt: new Date().toISOString(),
    explorerUrl: `https://explorer.solana.com/tx/${signature}?cluster=devnet`,
  };
}

export async function getBlockhash(rpcUrl) {
  const connection = new Connection(rpcUrl, 'confirmed');
  await requireDevnet(connection);
  return connection.getLatestBlockhash();
}

async function requireDevnet(connection) {
  const genesis = await connection.getGenesisHash();
  if (genesis !== 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG')
    throw new Error('O RPC configurado não pertence à Solana devnet.');
}

export function validateSignedMemo(anchor, serialized) {
  const transaction = Transaction.from(Buffer.from(serialized, 'base64'));
  const instruction = transaction.instructions[0];
  if (
    transaction.instructions.length !== 1 ||
    !transaction.feePayer?.equals(new PublicKey(anchor.wallet)) ||
    !instruction.programId.equals(new PublicKey(memoProgram)) ||
    instruction.data.toString('utf8') !== anchor.memo ||
    transaction.recentBlockhash !== anchor.blockhash ||
    !transaction.verifySignatures()
  )
    throw new Error('A transação assinada deve conter somente o Memo solicitado.');
  return transaction;
}

export async function submitAnchor(anchor, serialized, rpcUrl) {
  const transaction = validateSignedMemo(anchor, serialized);
  const connection = new Connection(rpcUrl, 'confirmed');
  await requireDevnet(connection);
  return connection.sendRawTransaction(transaction.serialize(), {
    preflightCommitment: 'confirmed',
    maxRetries: 3,
  });
}

export function validateWallet(value) {
  return new PublicKey(value).toBase58();
}
