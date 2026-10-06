import test from 'node:test';
import assert from 'node:assert/strict';
import { confirmAnchor, memoProgram, anchorMemo, validateSignedMemo } from '../server/solana.js';
import {
  Keypair,
  Transaction,
  TransactionInstruction,
  PublicKey,
  SystemProgram,
} from '@solana/web3.js';

const anchor = {
  campaignId: 'cause',
  count: 3,
  root: 'a'.repeat(64),
  wallet: 'wallet',
  memo: anchorMemo('cause', 3, 'a'.repeat(64)),
};
const fixture = () => ({
  slot: 42,
  meta: { err: null },
  transaction: {
    message: {
      accountKeys: [{ signer: true, pubkey: { toString: () => 'wallet' } }],
      instructions: [{ programId: { toString: () => memoProgram }, parsed: anchor.memo }],
    },
  },
});

test('envio aceita somente memo assinado e recusa transferência de valores', () => {
  const wallet = Keypair.generate();
  const blockhash = Keypair.generate().publicKey.toBase58();
  const request = { wallet: wallet.publicKey.toBase58(), memo: anchor.memo, blockhash };
  const make = () =>
    new Transaction({ feePayer: wallet.publicKey, recentBlockhash: blockhash }).add(
      new TransactionInstruction({
        programId: new PublicKey(memoProgram),
        keys: [{ pubkey: wallet.publicKey, isSigner: true, isWritable: false }],
        data: Buffer.from(anchor.memo),
      }),
    );
  const valid = make();
  valid.sign(wallet);
  assert.equal(
    validateSignedMemo(request, valid.serialize().toString('base64')).instructions.length,
    1,
  );
  const transfer = make().add(
    SystemProgram.transfer({
      fromPubkey: wallet.publicKey,
      toPubkey: Keypair.generate().publicKey,
      lamports: 1,
    }),
  );
  transfer.sign(wallet);
  assert.throws(
    () => validateSignedMemo(request, transfer.serialize().toString('base64')),
    /somente/,
  );
  assert.throws(
    () =>
      validateSignedMemo({ ...request, memo: 'outro hash' }, valid.serialize().toString('base64')),
    /somente/,
  );
});

test('ancoragem exige transação confirmada, assinante esperado e memo exato', async () => {
  const result = await confirmAnchor(
    anchor,
    'signature',
    'https://api.devnet.solana.com',
    async () => fixture(),
  );
  assert.equal(result.slot, 42);
  assert.match(result.explorerUrl, /cluster=devnet/);
  await assert.rejects(
    confirmAnchor(anchor, 'signature', 'https://api.devnet.solana.com', async () => null),
    /ainda não/,
  );
  const failed = fixture();
  failed.meta.err = 'failure';
  await assert.rejects(
    confirmAnchor(anchor, 'signature', 'https://api.devnet.solana.com', async () => failed),
    /falhou/,
  );
  const wrongMemo = fixture();
  wrongMemo.transaction.message.instructions[0].parsed = 'outro hash';
  await assert.rejects(
    confirmAnchor(anchor, 'signature', 'https://api.devnet.solana.com', async () => wrongMemo),
    /não corresponde/,
  );
  const wrongWallet = fixture();
  wrongWallet.transaction.message.accountKeys[0].pubkey.toString = () => 'outra carteira';
  await assert.rejects(
    confirmAnchor(anchor, 'signature', 'https://api.devnet.solana.com', async () => wrongWallet),
    /não corresponde/,
  );
});
