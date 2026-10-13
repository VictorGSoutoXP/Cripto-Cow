import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { Keypair } from '@solana/web3.js';
import { Store } from '../server/store.js';
import { createApp } from '../server/app.js';
import { DemoQuotes } from '../server/demo-exchange.js';
import { getAcceptance } from '../server/legal.js';
import { profileContributions } from '../server/contributions.js';
import { verifyEntries } from '../server/ledger.js';

const password = 'senha-de-contribuicao-teste';
const campaignId = 'horta-do-amanha';
const terms = (role = 'donor') => {
  const { version, hash } = getAcceptance(role);
  return { accepted: true, termsVersion: version, termsHash: hash };
};
const brl = (amount = 5050) => ({
  amount,
  requestKey: randomUUID(),
  donor: { type: 'anonymous' },
  ...terms(),
});
async function fixture(t) {
  const store = await Store.open({ path: ':memory:' });
  const server = createApp(store, {
    demoQuotes: new DemoQuotes({
      fetchPrices: async () => {
        throw new Error('offline');
      },
    }),
    // Native chain validation is covered in payments.test.js. These doubles isolate attribution.
    solanaPayments: {
      prepare: async () => ({
        blockhash: Keypair.generate().publicKey.toBase58(),
        lastValidBlockHeight: 200,
      }),
      confirm: async (_, txid) => ({ txid, slot: 123, confirmationStatus: 'confirmed' }),
    },
    zcashChain: {
      height: async () => 300,
      confirm: async (_, txid) => ({ txid, height: 301, blockHash: 'c'.repeat(64) }),
    },
  }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await store.close();
  });
  function client() {
    const cookies = new Map();
    return async (path, input, method = input === undefined ? 'GET' : 'POST') => {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/api${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Cookie: [...cookies].map(([key, value]) => `${key}=${value}`).join('; '),
        },
        body: input === undefined ? undefined : JSON.stringify(input),
      });
      for (const value of response.headers.getSetCookie()) {
        const pair = value.split(';')[0];
        const separator = pair.indexOf('=');
        cookies.set(pair.slice(0, separator), pair.slice(separator + 1));
      }
      return { status: response.status, body: await response.json() };
    };
  }
  async function register(request) {
    const email = `${randomUUID()}@example.test`;
    const result = await request('/auth/register', {
      email,
      name: 'Doador fictício',
      password,
      ...terms('account'),
    });
    assert.equal(result.status, 201);
    return result.body.user;
  }
  return { store, client, register };
}

test('totais em reais pertencem só à conta autenticada; repetição não duplica nem transfere autoria', async (t) => {
  const { client, register, store } = await fixture(t);
  const first = client(),
    second = client(),
    anonymous = client();
  await register(first);
  await register(second);
  const input = brl();
  const donation = await first(`/campaigns/${campaignId}/donations`, input);
  assert.equal(donation.status, 201);
  await first(`/campaigns/${campaignId}/donations`, input);
  await second(`/campaigns/${campaignId}/donations`, input);
  await anonymous(`/campaigns/${campaignId}/donations`, brl(10000));
  const summary = (await first('/profile/contributions')).body;
  assert.deepEqual(summary.totals.brl, { cents: 5050, count: 1 });
  assert.equal(summary.total, 1);
  assert.equal(summary.history[0].campaignTitle, (await store.campaign(campaignId)).title);
  assert.equal((await second('/profile/contributions')).body.total, 0);
  assert.equal((await anonymous('/profile/contributions')).status, 401);
  assert.equal((await first('/profile/contributions?offset=-1')).status, 400);
  const publicData = JSON.stringify((await anonymous(`/campaigns/${campaignId}`)).body);
  for (const privateField of ['user_id', 'contribution_owners', 'tokenHash', 'requestKey'])
    assert.equal(publicData.includes(privateField), false);
  assert.equal(summary.history[0].requestKey, undefined);
  assert.deepEqual(donation.body.donor, { type: 'anonymous' });
});

test('saldo e conversão não são contribuições; moedas virtuais mantêm precisão e conta original após logout', async (t) => {
  const { client, register } = await fixture(t);
  const request = client();
  await register(request);
  await request('/demo-exchange/wallet', {});
  await request('/demo-exchange/credit', { requestKey: randomUUID(), amount: '200' });
  const quote = (await request('/demo-exchange/quote')).body;
  for (const network of ['solana', 'zcash']) {
    const result = await request('/demo-exchange/convert', {
      requestKey: randomUUID(),
      network,
      amount: '100',
      quoteId: quote.id,
    });
    assert.equal(result.status, 200);
  }
  assert.equal((await request('/profile/contributions')).body.total, 0);
  const inputs = [];
  for (const [network, units] of [
    ['solana', '12345678'],
    ['zcash', '23456789'],
  ]) {
    const input = { requestKey: randomUUID(), network, campaignId, units, ...terms() };
    inputs.push(input);
    assert.equal((await request('/demo-exchange/donate', input)).status, 200);
  }
  const summary = (await request('/profile/contributions')).body;
  assert.equal(summary.totals.virtual.solana.amount, '0.012345678');
  assert.equal(summary.totals.virtual.zcash.amount, '0.23456789');
  assert.equal(summary.totals.brl.cents, 0);
  assert.equal(summary.totals.testnet.solana.count, 0);
  assert.equal(summary.total, 2);
  assert.equal(
    summary.history.every((receipt) => receipt.status === 'simulated' && receipt.txid === null),
    true,
  );
  await request('/auth/session', {}, 'DELETE');
  await register(request);
  for (const input of inputs)
    assert.equal((await request('/demo-exchange/donate', input)).status, 200);
  assert.equal((await request('/profile/contributions')).body.total, 0);
  const thirdDonation = await request('/demo-exchange/donate', {
    ...inputs[0],
    requestKey: randomUUID(),
  });
  assert.equal(thirdDonation.status, 200);
  assert.equal((await request('/profile/contributions')).body.total, 1);
});

test('pedidos de cripto só entram nos totais após confirmação, mesmo confirmados com outra sessão', async (t) => {
  const { client, register } = await fixture(t);
  const first = client(),
    second = client();
  await register(first);
  await register(second);
  const intents = [];
  for (const network of ['solana', 'zcash']) {
    const intent = await first(`/campaigns/${campaignId}/crypto-payments`, {
      requestKey: randomUUID(),
      network,
      amount: '0.01',
      payer: network === 'solana' ? Keypair.generate().publicKey.toBase58() : undefined,
      ...terms(),
    });
    assert.equal(intent.status, 201);
    intents.push(intent.body);
  }
  const before = (await first('/profile/contributions')).body;
  assert.equal(before.pendingCount, 2);
  assert.equal(before.totals.testnet.solana.units, '0');
  assert.equal(before.totals.testnet.zcash.units, '0');
  assert.equal(JSON.stringify(before).includes('token'), false);
  for (const intent of intents) {
    const body = {
      token: intent.token,
      txid: intent.network === 'solana' ? '2'.repeat(88) : 'a'.repeat(64),
    };
    assert.equal((await second(`/crypto-payments/${intent.id}/confirm`, body)).status, 200);
    assert.equal((await second(`/crypto-payments/${intent.id}/confirm`, body)).status, 200);
  }
  const after = (await first('/profile/contributions')).body;
  assert.equal(after.pendingCount, 0);
  assert.equal(after.totals.testnet.solana.amount, '0.010000000');
  assert.equal(after.totals.testnet.zcash.units, intents[1].units);
  assert.equal(after.totals.testnet.solana.count, 1);
  assert.equal(after.totals.testnet.zcash.count, 1);
  assert.equal((await second('/profile/contributions')).body.total, 0);
});

test('contribuições anônimas anteriores não são reivindicadas por login ou por repetição', async (t) => {
  const { client, register } = await fixture(t);
  const request = client();
  const input = brl();
  await request(`/campaigns/${campaignId}/donations`, input);
  await register(request);
  await request(`/campaigns/${campaignId}/donations`, input);
  assert.equal((await request('/profile/contributions')).body.total, 0);
});

test('paginação não reduz os totais e encerramento remove apenas o vínculo privado', async (t) => {
  const { client, register, store } = await fixture(t);
  const request = client();
  const user = await register(request);
  for (let index = 0; index < 23; index++)
    await store.donate(campaignId, 100, randomUUID(), true, { type: 'anonymous' }, user.id);
  const summary = await profileContributions(store, user.id, 20);
  assert.equal(summary.total, 23);
  assert.equal(summary.history.length, 3);
  assert.deepEqual(summary.totals.brl, { count: 23, cents: 2300 });
  const campaign = await store.campaign(campaignId);
  const closed = await request('/profile', { password }, 'DELETE');
  assert.equal(closed.status, 200);
  assert.equal((await profileContributions(store, user.id)).total, 0);
  const preserved = await store.campaign(campaignId);
  assert.equal(preserved.donations.length, campaign.donations.length);
  assert.equal(verifyEntries(preserved.ledger).valid, true);
  assert.equal(preserved.root, campaign.root);
});
