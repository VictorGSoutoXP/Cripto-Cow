import assert from 'node:assert/strict';
import test from 'node:test';
import { api, ApiError } from '../src/lib/api.ts';
import {
  readPendingAnchor,
  recoverPendingAnchor,
  savePendingAnchor,
  signedAnchorSignature,
  submitPendingAnchor,
} from '../src/lib/anchor-pending.ts';
import { Keypair, PublicKey, Transaction, TransactionInstruction } from '@solana/web3.js';

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

function pending(campaignId = 'horta-do-amanha', id = 'anchor-1') {
  return { campaignId, id, signature: '4'.repeat(88) };
}

function signedTransaction() {
  const signer = Keypair.fromSeed(new Uint8Array(32).fill(7));
  const transaction = new Transaction({
    feePayer: signer.publicKey,
    recentBlockhash: '11111111111111111111111111111111',
  }).add(
    new TransactionInstruction({
      programId: new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'),
      keys: [{ pubkey: signer.publicKey, isSigner: true, isWritable: false }],
      data: Buffer.from('elo:v1:horta-do-amanha:1:test'),
    }),
  );
  transaction.sign(signer);
  return transaction;
}

test('deriva a assinatura do Memo assinado e recusa uma transação sem assinatura válida', async () => {
  const transaction = signedTransaction();
  assert.equal(
    await signedAnchorSignature(transaction.serialize()),
    '3TSbRvZmtqReJyxdaoBMcsrumVFu6f8ToCJZ9k1rmA528SH7Siro5ofURHuhr46bTKcGbeh4aEHeZPBYn7xGSvnc',
  );
  transaction.signatures[0].signature = null;
  await assert.rejects(
    signedAnchorSignature(transaction.serialize({ requireAllSignatures: false })),
    /transação assinada válida/,
  );
});

test('salva somente dados públicos antes do envio para recuperar uma resposta perdida', async () => {
  const storage = memoryStorage();
  const signature = await signedAnchorSignature(signedTransaction().serialize());
  const saved = { ...pending(), signature };
  const networkError = new TypeError('Failed to fetch');
  let submissions = 0;
  await assert.rejects(
    submitPendingAnchor(storage, saved, async () => {
      submissions += 1;
      assert.deepEqual(readPendingAnchor(storage, saved.campaignId), saved);
      assert.deepEqual(
        Object.keys(JSON.parse(storage.getItem(`elo-pending-anchor:${saved.campaignId}`))).sort(),
        ['campaignId', 'id', 'signature'],
      );
      throw networkError;
    }),
    (error) => error === networkError,
  );
  const result = await recoverPendingAnchor(storage, saved.campaignId, async (value) => ({
    signature: value.signature,
    slot: 101,
  }));
  assert.equal(result.signature, signature);
  assert.equal(submissions, 1);
  assert.equal(readPendingAnchor(storage, saved.campaignId), null);
});

test('retorno divergente conserva a assinatura local para consulta sem segundo envio', async () => {
  const storage = memoryStorage();
  const saved = pending();
  await assert.rejects(
    submitPendingAnchor(storage, saved, async () => ({ signature: '5'.repeat(88) })),
    /não corresponde à transação assinada/,
  );
  assert.deepEqual(readPendingAnchor(storage, saved.campaignId), saved);
  assert.equal(
    await recoverPendingAnchor(storage, saved.campaignId, async (value) => value.signature),
    saved.signature,
  );
});

test('falha ao salvar a pendência impede transmitir a transação', async () => {
  const storage = memoryStorage();
  const quota = new Error('QuotaExceededError');
  const unavailable = {
    ...storage,
    setItem: () => {
      throw quota;
    },
  };
  await assert.rejects(
    submitPendingAnchor(unavailable, pending(), async () => {
      assert.fail('Não pode transmitir sem salvar a assinatura.');
    }),
    (error) => error === quota,
  );
});

test('recusa do envio conserva a pendência até confirmação ou expiração comprovada', async () => {
  const storage = memoryStorage();
  const saved = pending();
  const error = new ApiError('A transação foi recusada.', 400, 'TRANSACTION_MISMATCH');
  await assert.rejects(
    submitPendingAnchor(storage, saved, async () => {
      throw error;
    }),
    (value) => value === error,
  );
  assert.deepEqual(readPendingAnchor(storage, saved.campaignId), saved);
});

test('recupera a transação existente e encerra a pendência após confirmação', async () => {
  const storage = memoryStorage();
  const saved = pending();
  savePendingAnchor(storage, saved);
  const calls = [];
  const confirmed = { id: saved.id, signature: saved.signature, slot: 100 };
  const result = await recoverPendingAnchor(storage, saved.campaignId, async (value) => {
    calls.push(value);
    return confirmed;
  });
  assert.deepEqual(calls, [saved]);
  assert.equal(result, confirmed);
  assert.equal(readPendingAnchor(storage, saved.campaignId), null);
});

test('uma tentativa sem pendência não solicita confirmação', async () => {
  const result = await recoverPendingAnchor(memoryStorage(), 'recomecar', async () => {
    assert.fail('Não existe transação para recuperar.');
  });
  assert.equal(result, null);
});

test('confirmação pendente conserva a assinatura para a próxima tentativa', async () => {
  const storage = memoryStorage();
  const saved = pending();
  savePendingAnchor(storage, saved);
  const error = new ApiError('Aguarde a confirmação.', 409, 'CONFIRMATION_PENDING');
  await assert.rejects(
    recoverPendingAnchor(storage, saved.campaignId, async () => {
      throw error;
    }),
    (value) => value === error,
  );
  assert.deepEqual(readPendingAnchor(storage, saved.campaignId), saved);
  assert.equal(
    await recoverPendingAnchor(storage, saved.campaignId, async (value) => value.signature),
    saved.signature,
  );
  assert.equal(readPendingAnchor(storage, saved.campaignId), null);
});

test('rede, sessão expirada e indisponibilidade preservam a pendência', async () => {
  for (const error of [
    new TypeError('Failed to fetch'),
    new ApiError('Entre no painel.', 401),
    new ApiError('Banco indisponível.', 503),
    new ApiError('Serviço indisponível.', 503, 'TRANSACTION_FAILED'),
    new ApiError('Solicitação recusada.', 400),
  ]) {
    const storage = memoryStorage();
    const saved = pending();
    savePendingAnchor(storage, saved);
    await assert.rejects(
      recoverPendingAnchor(storage, saved.campaignId, async () => {
        throw error;
      }),
      (value) => value === error,
    );
    assert.deepEqual(readPendingAnchor(storage, saved.campaignId), saved);
  }
});

test('falhas terminais liberam nova tentativa e encerram a execução atual', async () => {
  for (const [code, status] of [
    ['ANCHOR_NOT_FOUND', 404],
    ['ANCHOR_HISTORY_MISMATCH', 400],
    ['ANCHOR_ALREADY_CONFIRMED', 409],
    ['TRANSACTION_FAILED', 400],
    ['TRANSACTION_MISMATCH', 400],
    ['TRANSACTION_EXPIRED', 410],
  ]) {
    const storage = memoryStorage();
    const saved = pending();
    savePendingAnchor(storage, saved);
    let confirmations = 0;
    await assert.rejects(
      recoverPendingAnchor(storage, saved.campaignId, async () => {
        confirmations += 1;
        throw new ApiError('Transação inválida.', status, code);
      }),
      (error) =>
        error.cause?.code === code && error.message.includes('Clique novamente para preparar'),
    );
    assert.equal(confirmations, 1);
    assert.equal(readPendingAnchor(storage, saved.campaignId), null);
    const next = pending(saved.campaignId, 'anchor-2');
    savePendingAnchor(storage, next);
    assert.deepEqual(readPendingAnchor(storage, saved.campaignId), next);
  }
});

test('campanhas conservam pendências independentes e a migração mantém IDs legados', async () => {
  const first = pending();
  const second = pending('patas-em-casa', 'anchor-2');
  const storage = memoryStorage({ 'elo-pending-anchor': JSON.stringify(first) });
  savePendingAnchor(storage, second);
  assert.deepEqual(readPendingAnchor(storage, second.campaignId), second);
  assert.equal(storage.getItem('elo-pending-anchor'), null);
  assert.deepEqual(readPendingAnchor(storage, first.campaignId), first);
  await recoverPendingAnchor(storage, second.campaignId, async () => ({ confirmed: true }));
  assert.deepEqual(readPendingAnchor(storage, first.campaignId), first);
  assert.equal(readPendingAnchor(storage, second.campaignId), null);
});

test('migração só remove a chave legada depois de salvar sem perda', () => {
  const saved = pending();
  const storage = memoryStorage({ 'elo-pending-anchor': JSON.stringify(saved) });
  const quota = new Error('QuotaExceededError');
  const unavailable = {
    ...storage,
    setItem: () => {
      throw quota;
    },
  };
  assert.throws(
    () => readPendingAnchor(unavailable, saved.campaignId),
    (error) => error === quota,
  );
  assert.equal(storage.getItem('elo-pending-anchor'), JSON.stringify(saved));
  assert.deepEqual(readPendingAnchor(storage, saved.campaignId), saved);
});

test('migração não descarta outra assinatura já salva na mesma campanha', async () => {
  const legacy = pending();
  const newer = { ...pending(legacy.campaignId, 'anchor-2'), signature: '5'.repeat(88) };
  const storage = memoryStorage({ 'elo-pending-anchor': JSON.stringify(legacy) });
  savePendingAnchor(storage, newer);
  assert.deepEqual(readPendingAnchor(storage, legacy.campaignId), newer);
  assert.equal(storage.getItem('elo-pending-anchor'), JSON.stringify(legacy));
  await recoverPendingAnchor(storage, legacy.campaignId, async () => ({ confirmed: true }));
  assert.deepEqual(readPendingAnchor(storage, legacy.campaignId), legacy);
  assert.equal(storage.getItem('elo-pending-anchor'), null);
});

test('dados corrompidos encerram a tentativa sem atingir outras campanhas', async () => {
  const other = pending('patas-em-casa', 'anchor-2');
  for (const value of [
    '{',
    '',
    'null',
    JSON.stringify({ ...pending(), signature: 'invalid' }),
    JSON.stringify({ ...pending(), campaignId: 'recomecar' }),
  ]) {
    const storage = memoryStorage({ 'elo-pending-anchor:horta-do-amanha': value });
    savePendingAnchor(storage, other);
    await assert.rejects(
      recoverPendingAnchor(storage, 'horta-do-amanha', async () => {
        assert.fail('Dados inválidos não podem ser enviados.');
      }),
      /pendência salva estava inválida/,
    );
    assert.equal(readPendingAnchor(storage, 'horta-do-amanha'), null);
    assert.deepEqual(readPendingAnchor(storage, other.campaignId), other);
  }
  const legacy = memoryStorage({ 'elo-pending-anchor': 'null' });
  assert.throws(
    () => readPendingAnchor(legacy, 'horta-do-amanha'),
    /pendência salva estava inválida/,
  );
  assert.equal(legacy.getItem('elo-pending-anchor'), null);
});

test('API expõe status e código mesmo quando o serviço retorna erro sem JSON', async (t) => {
  const responses = [
    new Response(JSON.stringify({ error: 'Aguarde.', code: 'CONFIRMATION_PENDING' }), {
      status: 409,
    }),
    new Response('<h1>Service unavailable</h1>', { status: 503 }),
  ];
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url, options });
    return responses.shift();
  });
  await assert.rejects(
    api('/anchors/anchor-1/confirm', { method: 'POST', body: '{}' }),
    (error) =>
      error instanceof ApiError && error.status === 409 && error.code === 'CONFIRMATION_PENDING',
  );
  await assert.rejects(
    api('/anchors/anchor-1/confirm'),
    (error) => error instanceof ApiError && error.status === 503 && error.code === undefined,
  );
  assert.equal(calls[0].url, '/api/anchors/anchor-1/confirm');
  assert.equal(calls[0].options.credentials, 'same-origin');
});
