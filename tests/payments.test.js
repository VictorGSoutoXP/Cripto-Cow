import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import {
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
} from '@solana/web3.js';
import bs58 from 'bs58';
import { Store } from '../server/store.js';
import { createApp } from '../server/app.js';
import { getAcceptance } from '../server/legal.js';
import { devnetGenesisHash, memoProgram } from '../server/solana.js';
import { SolanaPayments } from '../server/solana-payments.js';
import { ZcashChain, transparentOutputs, zcashReceiverScript } from '../server/zcash-chain.js';
import { amountUnits, unitsAmount } from '../server/payments.js';
import receivers from '../shared/demo-payment-receivers.json' with { type: 'json' };
import { verifyPaymentReceipts } from '../server/ledger.js';

const terms = () => {
  const a = getAcceptance('donor');
  return { accepted: true, termsVersion: a.version, termsHash: a.hash };
};
function rawZcash(address, units, version = 5) {
  const header = Buffer.alloc(version >= 5 ? 20 : 8);
  header.writeUInt32LE(0x80000000 + version);
  header.writeUInt32LE({ 4: 0x892f2085, 5: 0x26a7270a, 6: 0xd884b698 }[version], 4);
  const amount = Buffer.alloc(8);
  amount.writeBigInt64LE(BigInt(units));
  const script = Buffer.from(zcashReceiverScript(address), 'hex');
  return Buffer.concat([
    header,
    Buffer.from([0, 1]),
    amount,
    Buffer.from([script.length]),
    script,
    Buffer.alloc(20),
  ]);
}
async function fixture(t) {
  const store = await Store.open({ path: ':memory:' });
  const solana = new SolanaPayments('https://api.devnet.solana.com');
  const hash = Keypair.generate().publicKey.toBase58();
  solana.prepare = async () => ({ blockhash: hash, lastValidBlockHeight: 200 });
  let parsed = null;
  let wrongNetwork = false;
  let expired = false;
  solana.connection = {
    getGenesisHash: async () => (wrongNetwork ? 'mainnet' : devnetGenesisHash),
    sendRawTransaction: async (bytes) => bs58.encode(Transaction.from(bytes).signature),
    getParsedTransaction: async () => parsed,
    getBlockHeight: async () => (expired ? 201 : 190),
    getSignatureStatuses: async () => ({ value: [null] }),
  };
  const zcash = new ZcashChain();
  t.after(() => zcash.close());
  let ztx = null;
  let znetwork = 'test';
  let tip = 300;
  let zhash;
  zcash.call = async (method, args) => {
    if (method === 'getLightdInfo') return { chainName: znetwork, blockHeight: String(tip) };
    if (method === 'getTreeState')
      return { network: znetwork, height: ztx.height, hash: 'c'.repeat(64) };
    if (method === 'getBlock')
      return {
        height: ztx.height,
        hash: Buffer.from('c'.repeat(64), 'hex'),
        vtx: [{ txid: zhash }],
      };
    zhash = args.hash;
    return ztx;
  };
  const app = createApp(store, { solanaPayments: solana, zcashChain: zcash });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await store.close();
  });
  let cookie = '';
  const request = async (path, input, method = 'POST') => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: method === 'GET' ? undefined : JSON.stringify(input),
    });
    if (response.headers.get('set-cookie'))
      cookie = response.headers.get('set-cookie').split(';')[0];
    return { status: response.status, body: await response.json() };
  };
  return {
    store,
    request,
    solana,
    zcash,
    setParsed: (value) => (parsed = value),
    setWrongNetwork: (value) => (wrongNetwork = value),
    setExpired: (value) => (expired = value),
    setZ: (value, height = 301, network = 'test') => {
      ztx = value;
      tip = height;
      znetwork = network;
    },
  };
}
function input(network, payer) {
  return { network, amount: '0.01', payer, requestKey: randomUUID(), ...terms() };
}
function signed(intent, payer, change = {}) {
  const tx = new Transaction({ feePayer: payer.publicKey, recentBlockhash: intent.blockhash }).add(
    SystemProgram.transfer({
      fromPubkey: payer.publicKey,
      toPubkey: new PublicKey(change.receiver ?? intent.receiver),
      lamports: BigInt(change.units ?? intent.units),
    }),
    new TransactionInstruction({
      programId: new PublicKey(memoProgram),
      keys: [{ pubkey: payer.publicKey, isSigner: true, isWritable: false }],
      data: Buffer.from(change.memo ?? intent.memo),
    }),
  );
  tx.sign(payer);
  return tx.serialize().toString('base64');
}
function parsed(intent, overrides = {}) {
  return {
    slot: 100,
    meta: { err: null },
    transaction: {
      message: {
        accountKeys: [{ pubkey: new PublicKey(intent.payer), signer: true }],
        instructions: [
          {
            programId: SystemProgram.programId,
            parsed: {
              type: 'transfer',
              info: {
                source: intent.payer,
                destination: intent.receiver,
                lamports: Number(intent.units),
                ...overrides,
              },
            },
          },
          { programId: new PublicKey(memoProgram), parsed: intent.memo },
        ],
      },
    },
  };
}

test('valores de moedas usam unidades inteiras, limites e precisão exata', () => {
  assert.equal(amountUnits('0.123456789', 'solana'), '123456789');
  assert.equal(amountUnits('0.12345678', 'zcash'), '12345678');
  assert.equal(unitsAmount('100001', 'zcash'), '0.00100001');
  for (const value of ['0', '-1', '1e2', '0.000000001', '11', '0.1234567890'])
    assert.throws(() => amountUnits(value, 'solana'));
  assert.throws(() => amountUnits('0.123456789', 'zcash'));
});
test('Solana só envia o pagamento e Memo assinados do pedido; recusa alterações', async (t) => {
  const f = await fixture(t);
  const payer = Keypair.generate();
  const { body: intent, status } = await f.request(
    '/campaigns/horta-do-amanha/crypto-payments',
    input('solana', payer.publicKey.toBase58()),
  );
  assert.equal(status, 201);
  assert.equal(intent.tokenHash, undefined);
  for (const change of [
    { units: '1' },
    { receiver: Keypair.generate().publicKey.toBase58() },
    { memo: 'outro-pedido' },
  ]) {
    const bad = await f.request(`/crypto-payments/${intent.id}/submit`, {
      token: intent.token,
      transaction: signed(intent, payer, change),
    });
    assert.equal(bad.status, 400);
    assert.equal(bad.body.code, 'TRANSACTION_MISMATCH');
  }
  const submitted = await f.request(`/crypto-payments/${intent.id}/submit`, {
    token: intent.token,
    transaction: signed(intent, payer),
  });
  assert.equal(submitted.status, 200);
  assert.ok(submitted.body.txid);
  const pending = await f.request(`/crypto-payments/${intent.id}/confirm`, {
    token: intent.token,
    txid: submitted.body.txid,
  });
  assert.equal(pending.body.code, 'CONFIRMATION_PENDING');
  f.setParsed(parsed(intent));
  const before = await f.store.campaign(intent.campaignId);
  const results = await Promise.all(
    Array.from({ length: 4 }, () =>
      f.request(`/crypto-payments/${intent.id}/confirm`, {
        token: intent.token,
        txid: submitted.body.txid,
      }),
    ),
  );
  assert.ok(results.every((result) => result.status === 200 && result.body.status === 'confirmed'));
  const after = await f.store.campaign(intent.campaignId);
  assert.equal(after.raised, before.raised);
  assert.equal(after.balance, before.balance);
  assert.equal(after.cryptoTotals.solana, intent.units);
  assert.equal(after.cryptoPayments.length, 1);
  assert.equal(after.ledger.filter((entry) => entry.type === 'crypto_donation').length, 1);
  assert.equal(after.integrity.valid, true);
  assert.equal(after.cryptoPayments[0].tokenHash, undefined);
  assert.equal(verifyPaymentReceipts(after.ledger, after.cryptoPayments), true);
  assert.equal(
    verifyPaymentReceipts(after.ledger, [{ ...after.cryptoPayments[0], amount: '9.000000000' }]),
    false,
  );
  assert.equal(
    verifyPaymentReceipts(after.ledger, [
      { ...after.cryptoPayments[0], receiver: payer.publicKey.toBase58() },
    ]),
    false,
  );
  assert.equal(verifyPaymentReceipts(after.ledger, []), false);
  const exported = await f.request(`/campaigns/${intent.campaignId}/ledger`, undefined, 'GET');
  assert.equal(exported.body.cryptoPayments.length, 1);
});
test('Solana confirma na rede correta e recusa valor ou destinatário errado, falha e expiração', async (t) => {
  const f = await fixture(t);
  const payer = Keypair.generate();
  const { body: intent } = await f.request(
    '/campaigns/horta-do-amanha/crypto-payments',
    input('solana', payer.publicKey.toBase58()),
  );
  const txid = bs58.encode(
    Transaction.from(Buffer.from(signed(intent, payer), 'base64')).signature,
  );
  const confirm = () =>
    f.request(`/crypto-payments/${intent.id}/confirm`, { token: intent.token, txid });
  f.setWrongNetwork(true);
  assert.equal((await confirm()).body.code, 'WRONG_NETWORK');
  f.setWrongNetwork(false);
  f.setParsed(parsed(intent, { destination: payer.publicKey.toBase58() }));
  assert.equal((await confirm()).body.code, 'TRANSACTION_MISMATCH');
  f.setParsed(parsed(intent, { lamports: 1 }));
  assert.equal((await confirm()).body.code, 'TRANSACTION_MISMATCH');
  f.setParsed({ ...parsed(intent), meta: { err: 'failed' } });
  assert.equal((await confirm()).body.code, 'TRANSACTION_FAILED');
  f.setParsed(null);
  f.setExpired(true);
  assert.equal((await confirm()).body.code, 'TRANSACTION_EXPIRED');
  assert.equal((await f.store.campaign(intent.campaignId)).cryptoPayments.length, 0);
});
test('Zcash confere saída transparente, valor, altura e testnet antes de creditar recibo', async (t) => {
  const f = await fixture(t);
  const { body: intent, status } = await f.request(
    '/campaigns/horta-do-amanha/crypto-payments',
    input('zcash'),
  );
  assert.equal(status, 201);
  assert.equal(intent.minHeight, 301);
  assert.match(intent.uri, /^zcash:tm/);
  assert.ok(BigInt(intent.units) > 1000000n);
  const txid = 'a'.repeat(64);
  const confirm = () =>
    f.request(`/crypto-payments/${intent.id}/confirm`, { token: intent.token, txid });
  f.setZ({ height: '0', data: rawZcash(intent.receiver, intent.units) });
  assert.equal((await confirm()).body.code, 'CONFIRMATION_PENDING');
  f.setZ({ height: '300', data: rawZcash(intent.receiver, intent.units) });
  assert.equal((await confirm()).body.code, 'TRANSACTION_MISMATCH');
  f.setZ({ height: '301', data: rawZcash(intent.receiver, '1') });
  assert.equal((await confirm()).body.code, 'TRANSACTION_MISMATCH');
  f.setZ({ height: '301', data: rawZcash(intent.receiver, intent.units) }, 301, 'main');
  assert.equal((await confirm()).body.code, 'WRONG_NETWORK');
  f.setZ({ height: '301', data: rawZcash(intent.receiver, intent.units) });
  assert.equal((await confirm()).body.status, 'confirmed');
  assert.equal((await confirm()).body.status, 'confirmed');
  const c = await f.store.campaign(intent.campaignId);
  assert.equal(c.cryptoTotals.zcash, intent.units);
  assert.equal(c.cryptoPayments.length, 1);
  assert.equal(c.integrity.valid, true);
});
test('reutilizar TXID em outro pedido não duplica ledger nem total', async (t) => {
  const f = await fixture(t);
  const txid = 'b'.repeat(64);
  const create = async (campaign) =>
    (await f.request(`/campaigns/${campaign}/crypto-payments`, input('zcash'))).body;
  const first = await create('horta-do-amanha');
  const second = await create('patas-em-casa');
  const confirm = (i) => f.request(`/crypto-payments/${i.id}/confirm`, { token: i.token, txid });
  f.setZ({ height: '301', data: rawZcash(first.receiver, first.units) });
  assert.equal((await confirm(first)).status, 200);
  f.setZ({ height: '302', data: rawZcash(second.receiver, second.units) }, 302);
  assert.equal((await confirm(second)).body.code, 'TRANSACTION_REUSED');
  assert.equal((await f.store.campaign(second.campaignId)).cryptoPayments.length, 0);
  assert.equal(
    (await f.store.campaign(second.campaignId)).ledger.filter(
      (entry) => entry.type === 'crypto_donation',
    ).length,
    0,
  );
});
test('pedidos persistem, código é obrigatório e mesma quantia SOL permite doadores diferentes', async (t) => {
  const f = await fixture(t);
  const payer = Keypair.generate();
  const i = input('solana', payer.publicKey.toBase58());
  const { body: a } = await f.request('/campaigns/horta-do-amanha/crypto-payments', i);
  const { status } = await f.request('/campaigns/horta-do-amanha/crypto-payments', {
    ...i,
    requestKey: randomUUID(),
  });
  assert.equal(status, 201);
  const other = createApp(f.store, { solanaPayments: f.solana, zcashChain: f.zcash });
  assert.ok(other);
  const saved = await f.request(`/crypto-payments/${a.id}/status`, { token: a.token });
  assert.equal(saved.body.id, a.id);
  assert.equal(saved.body.tokenHash, undefined);
  assert.equal(
    (await f.request(`/crypto-payments/${a.id}/status`, { token: 'x'.repeat(32) })).status,
    404,
  );
  assert.equal(
    (await f.request('/campaigns/horta-do-amanha/crypto-payments', { ...i, termsHash: 'old' })).body
      .code,
    'TERMS_CHANGED',
  );
  assert.equal(
    (await f.request('/campaigns/horta-do-amanha/crypto-payments', { ...i, accepted: false }))
      .status,
    400,
  );
});
test('campanha suspensa ou sem destinatário não prepara pagamento', async (t) => {
  const f = await fixture(t);
  const campaign = await f.store.get('campaigns', 'horta-do-amanha');
  await f.store.save('campaigns', { ...campaign, status: 'frozen' });
  assert.equal(
    (await f.request(`/campaigns/${campaign.id}/crypto-payments`, input('zcash'))).body.code,
    'CAMPAIGN_UNAVAILABLE',
  );
  await f.store.save('campaigns', { ...campaign, ownerId: 'owner', status: 'active' });
  assert.equal(
    (await f.request(`/campaigns/${campaign.id}/crypto-payments`, input('zcash'))).body.code,
    'RECEIVER_UNAVAILABLE',
  );
  assert.equal(
    (await f.request(`/campaigns/${campaign.id}/payment-methods`, undefined, 'GET')).body.methods[0]
      .available,
    false,
  );
});
test('parser Zcash V4/V5/V6 aceita saídas esperadas e rejeita truncamento, valores negativos e versões desconhecidas', () => {
  for (const v of [4, 5, 6])
    assert.equal(transparentOutputs(rawZcash(receivers.zcash, '100001', v))[0].units, '100001');
  assert.throws(() => transparentOutputs(rawZcash(receivers.zcash, '-1')));
  const valid = rawZcash(receivers.zcash, '100001');
  assert.throws(() => transparentOutputs(valid.subarray(0, 30)));
  valid.writeUInt32LE(0x80000007);
  assert.throws(() => transparentOutputs(valid));
});

test('organizador só configura as carteiras verificadas da própria conta na própria campanha', async (t) => {
  const f = await fixture(t);
  const consent = (role) => {
    const a = getAcceptance(role);
    return { accepted: true, termsVersion: a.version, termsHash: a.hash };
  };
  const { body: account } = await f.request('/auth/register', {
    name: 'Organizador fictício',
    email: 'carteira@example.test',
    password: 'senha-exclusiva-de-teste',
    ...consent('account'),
  });
  const created = await f.request('/campaigns', {
    title: 'Campanha com carteira de teste',
    description: 'Campanha fictícia para conferir o destinatário escolhido pelo organizador.',
    organization: 'Coletivo fictício',
    location: 'São Paulo, SP',
    category: 'Comunidade',
    deadline: '2099-01-01',
    budget: [{ name: 'Materiais', planned: 100000 }],
    ...consent('organizer'),
  });
  assert.equal(created.status, 201);
  const route = `/campaigns/${created.body.id}/payment-receivers`;
  assert.equal((await f.request(route, { networks: ['solana'] }, 'PUT')).status, 409);
  await f.store.execute({
    sql: 'INSERT INTO profile_wallets (id, user_id, network, address, verified_at) VALUES (?, ?, ?, ?, ?)',
    args: [randomUUID(), account.user.id, 'solana', receivers.solana, new Date().toISOString()],
  });
  assert.equal((await f.request(route, { networks: ['solana'] }, 'PUT')).status, 200);
  assert.equal(
    (await f.store.get('campaigns', created.body.id)).cryptoReceivers.solana,
    receivers.solana,
  );
  assert.equal(
    (
      await f.request(
        '/campaigns/horta-do-amanha/payment-receivers',
        { networks: ['solana'] },
        'PUT',
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await f.request(
        route,
        { networks: ['solana'], receiver: Keypair.generate().publicKey.toBase58() },
        'PUT',
      )
    ).status,
    400,
  );
});
