import { once } from 'node:events';
import { randomBytes } from 'node:crypto';
import {
  Connection,
  Keypair,
  Transaction,
  TransactionInstruction,
  PublicKey,
} from '@solana/web3.js';
import { Store } from '../server/store.js';
import { createApp } from '../server/app.js';
import { devnetGenesisHash } from '../server/solana.js';

// Explicit testnet-only smoke test. No keys or credentials are written to disk.
const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const connection = new Connection(rpcUrl, {
  commitment: 'confirmed',
  disableRetryOnRateLimit: true,
  fetch: (url, options) => fetch(url, { ...options, signal: AbortSignal.timeout(20000) }),
});
const store = await Store.open({ path: ':memory:' });
const password = randomBytes(24).toString('hex');
const wallet = Keypair.generate();
const server = createApp(store, { password, rpcUrl, demo: true, production: false }).listen(
  0,
  '127.0.0.1',
);
await once(server, 'listening');
let cookie = '';
const base = `http://127.0.0.1:${server.address().port}/api`;
async function request(path, body) {
  const response = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
  const result = await response.json();
  if (!response.ok) throw Object.assign(new Error(result.error), { code: result.code });
  return result;
}
try {
  if ((await connection.getGenesisHash()) !== devnetGenesisHash)
    throw new Error('Este script aceita somente Solana devnet.');
  await request('/admin/session', { password });
  const campaignId = 'horta-do-amanha';
  const prepared = await request(`/campaigns/${campaignId}/anchors/prepare`, {
    wallet: wallet.publicKey.toBase58(),
  });
  const airdrop = await connection.requestAirdrop(wallet.publicKey, 1000000000);
  const limit = Date.now() + 30000;
  while (Date.now() < limit && (await connection.getBalance(wallet.publicKey)) < 5000)
    await new Promise((resolve) => setTimeout(resolve, 1500));
  if ((await connection.getBalance(wallet.publicKey)) < 5000)
    throw new Error('O airdrop não confirmou a tempo. Nenhuma ancoragem foi enviada.');
  const transaction = new Transaction({
    feePayer: wallet.publicKey,
    recentBlockhash: prepared.blockhash,
  }).add(
    new TransactionInstruction({
      programId: new PublicKey(prepared.memoProgram),
      keys: [{ pubkey: wallet.publicKey, isSigner: true, isWritable: false }],
      data: Buffer.from(prepared.memo),
    }),
  );
  transaction.sign(wallet);
  const submitted = await request(`/anchors/${prepared.id}/submit`, {
    transaction: transaction.serialize().toString('base64'),
  });
  const confirmationLimit = Date.now() + 30000;
  while (true) {
    try {
      const result = await request(`/anchors/${prepared.id}/confirm`, submitted);
      console.log(
        JSON.stringify(
          {
            network: 'devnet',
            campaignId,
            root: result.root,
            count: result.count,
            signature: result.signature,
            explorerUrl: result.explorerUrl,
            confirmedAt: result.confirmedAt,
            faucetSignature: airdrop,
          },
          null,
          2,
        ),
      );
      break;
    } catch (error) {
      if (error.code !== 'CONFIRMATION_PENDING' || Date.now() > confirmationLimit) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  }
} catch (error) {
  console.error(`Verificação devnet não concluída: ${error.message}`);
  process.exitCode = 1;
} finally {
  await new Promise((resolve) => server.close(resolve));
  await store.close();
}
