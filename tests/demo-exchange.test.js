import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { Store } from '../server/store.js';
import { createApp } from '../server/app.js';
import { DemoQuotes, DemoExchange, demoUnits } from '../server/demo-exchange.js';
import { getAcceptance } from '../server/legal.js';
import { verifyDemoReceipts } from '../server/demo-receipts.js';
import { verifyPaymentReceipts } from '../server/ledger.js';

const now = Date.parse('2026-10-13T03:00:00Z');
function quotes(options = {}) {
  return new DemoQuotes({
    now: () => now,
    fetchPrices: async () => ({
      ok: true,
      json: async () => ({
        solana: { brl: 500, last_updated_at: now / 1000 },
        zcash: { brl: 200, last_updated_at: now / 1000 },
      }),
    }),
    ...options,
  });
}
function terms() {
  const a = getAcceptance('donor');
  return { accepted: true, termsVersion: a.version, termsHash: a.hash };
}
async function fixture(t, options = {}) {
  const store = await Store.open({ path: ':memory:' });
  const rates = quotes();
  const server = createApp(store, { demoQuotes: rates, ...options }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await store.close();
  });
  const client = () => {
    let cookie = '';
    return async (path, input, method = 'POST') => {
      const r = await fetch(`http://127.0.0.1:${server.address().port}/api${path}`, {
        method,
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: method === 'GET' ? undefined : JSON.stringify(input),
      });
      const next = r.headers.get('set-cookie');
      if (next) cookie = next.split(';')[0];
      return { status: r.status, body: await r.json(), cookie: next };
    };
  };
  const request = client();
  await request('/demo-exchange/wallet', {});
  return { store, request, client, quotes: rates };
}
const operation = (data) => ({ requestKey: randomUUID(), ...data });
test('valor fictício em reais usa centavos inteiros e rejeita entradas inválidas', () => {
  assert.equal(demoUnits('50,25'), 5025);
  assert.equal(demoUnits('50.25'), 5025);
  for (const amount of ['0', '-50', '1e2', '0.99', '1.001', '10000.01', 'Infinity'])
    assert.throws(() => demoUnits(amount));
});
test('cotações validam fonte e horário, compartilham consulta e mostram fallback fictício em falha ou dados antigos', async () => {
  let calls = 0;
  const q = quotes({
    fetchPrices: async () => {
      calls++;
      return {
        ok: true,
        json: async () => ({
          solana: { brl: 500, last_updated_at: now / 1000 },
          zcash: { brl: 200, last_updated_at: now / 1000 },
        }),
      };
    },
  });
  const results = await Promise.all([q.get(), q.get(), q.get()]);
  assert.equal(calls, 1);
  assert.equal(results[0].rates.solana.source, 'CoinGecko');
  assert.equal(results[0].rates.solana.basis, 'market-reference');
  const down = await quotes({
    fetchPrices: async () => {
      throw new Error('offline');
    },
  }).get();
  assert.equal(down.rates.solana.basis, 'fictional');
  assert.equal(down.rates.solana.quotedAt, null);
  const stale = await quotes({
    fetchPrices: async () => ({
      ok: true,
      json: async () => ({
        solana: { brl: 500, last_updated_at: (now - 3600000) / 1000 },
        zcash: { brl: NaN, last_updated_at: now / 1000 },
      }),
    }),
  }).get();
  assert.equal(stale.rates.solana.basis, 'fictional');
  assert.equal(stale.rates.zcash.basis, 'fictional');
});
test('crédito, conversão e doação fictícia são atômicos e idempotentes sem alterar reais ou cripto confirmada da campanha', async (t) => {
  const f = await fixture(t);
  const credit = operation({ amount: '50' });
  const repeated = await Promise.all([
    f.request('/demo-exchange/credit', credit),
    f.request('/demo-exchange/credit', credit),
  ]);
  assert.ok(repeated.every((r) => r.status === 200 && r.body.wallet.brlCents === 5000));
  const quote = (await f.request('/demo-exchange/quote', undefined, 'GET')).body;
  const convert = operation({ amount: '50', network: 'solana', quoteId: quote.id });
  const converted = await f.request('/demo-exchange/convert', convert);
  assert.equal(converted.body.amount, '0.100000000');
  assert.equal(converted.body.wallet.brlCents, 0);
  assert.equal(
    (await f.request('/demo-exchange/convert', convert)).body.wallet.units.solana,
    '100000000',
  );
  const before = await f.store.campaign('horta-do-amanha');
  const donate = operation({
    campaignId: before.id,
    network: 'solana',
    units: '100000000',
    ...terms(),
  });
  const donations = await Promise.all(
    Array.from({ length: 3 }, () => f.request('/demo-exchange/donate', donate)),
  );
  assert.ok(
    donations.every(
      (r) =>
        r.status === 200 &&
        r.body.status === 'simulated' &&
        r.body.simulated === true &&
        !r.body.txid,
    ),
  );
  const after = await f.store.campaign(before.id);
  assert.equal(after.raised, before.raised);
  assert.equal(after.balance, before.balance);
  assert.equal(after.cryptoTotals.solana, '0');
  assert.equal(after.cryptoPayments.length, 0);
  assert.equal(after.simulatedCryptoTotals.solana, '100000000');
  assert.equal(after.simulatedCryptoDonations.length, 1);
  assert.equal(after.simulatedCryptoDonations[0].acceptance, undefined);
  assert.equal(after.integrity.valid, true);
  assert.equal(verifyDemoReceipts(after.ledger, after.simulatedCryptoDonations), true);
  assert.equal(verifyPaymentReceipts(after.ledger, after.cryptoPayments), true);
  assert.equal(
    verifyDemoReceipts(after.ledger, [
      { ...after.simulatedCryptoDonations[0], status: 'confirmed' },
    ]),
    false,
  );
  assert.equal(
    verifyDemoReceipts(after.ledger, [
      { ...after.simulatedCryptoDonations[0], amount: '1.000000000' },
    ]),
    false,
  );
  const exported = await f.request(`/campaigns/${before.id}/ledger`, undefined, 'GET');
  assert.equal(exported.body.simulatedCryptoDonations.length, 1);
});
test('saldo insuficiente, cotação alterada, campanha suspensa e ausência de aceite não debitam carteira fictícia', async (t) => {
  const f = await fixture(t);
  const q = await f.quotes.get();
  assert.equal(
    (
      await f.request(
        '/demo-exchange/convert',
        operation({ amount: '50', network: 'zcash', quoteId: q.id }),
      )
    ).body.code,
    'INSUFFICIENT_DEMO_BALANCE',
  );
  await f.request('/demo-exchange/credit', operation({ amount: '50' }));
  assert.equal(
    (
      await f.request(
        '/demo-exchange/convert',
        operation({ amount: '50', network: 'zcash', quoteId: 'a'.repeat(64) }),
      )
    ).body.code,
    'QUOTE_CHANGED',
  );
  assert.equal(
    (
      await f.request(
        '/demo-exchange/convert',
        operation({ amount: '50', network: 'zcash', quoteId: q.id }),
      )
    ).body.amount,
    '0.25000000',
  );
  const donate = operation({
    campaignId: 'horta-do-amanha',
    network: 'zcash',
    units: '25000000',
    ...terms(),
  });
  assert.equal(
    (await f.request('/demo-exchange/donate', { ...donate, accepted: false })).status,
    400,
  );
  const c = await f.store.get('campaigns', donate.campaignId);
  await f.store.save('campaigns', { ...c, status: 'frozen' });
  assert.equal(
    (await f.request('/demo-exchange/donate', donate)).body.code,
    'CAMPAIGN_UNAVAILABLE',
  );
  const state = (await f.request('/demo-exchange/wallet', {})).body;
  assert.equal(state.units.zcash, '25000000');
});
test('cada navegador tem carteira isolada, cookie HttpOnly e repetição com outros dados é recusada', async (t) => {
  const f = await fixture(t);
  const other = f.client();
  const opened = await other('/demo-exchange/wallet', {});
  assert.match(opened.cookie, /HttpOnly/);
  assert.match(opened.cookie, /SameSite=Strict/);
  assert.equal(opened.body.token, undefined);
  const credit = operation({ amount: '50' });
  await f.request('/demo-exchange/credit', credit);
  assert.equal((await other('/demo-exchange/credit', credit)).body.code, 'REQUEST_CONFLICT');
  assert.equal(
    (await f.request('/demo-exchange/credit', { ...credit, amount: '100' })).body.code,
    'REQUEST_CONFLICT',
  );
  assert.equal((await other('/demo-exchange/wallet', {})).body.brlCents, 0);
  assert.equal(
    (await f.client()('/demo-exchange/credit', operation({ amount: '50' }))).body.code,
    'DEMO_SESSION_REQUIRED',
  );
});
test('saldo fictício é persistido e uma nova instância não credita de novo após mudança da cotação', async (t) => {
  const store = await Store.open({ path: ':memory:' });
  t.after(() => store.close());
  const first = new DemoExchange(store, quotes());
  const { token } = await first.open();
  const credit = operation({ amount: '50' });
  await first.operation(token, 'credit', credit);
  const q = await first.quotes.get();
  const convert = operation({ amount: '50', network: 'solana', quoteId: q.id });
  await first.operation(token, 'convert', convert);
  const reopened = new DemoExchange(
    store,
    quotes({
      fetchPrices: async () => {
        throw new Error('offline');
      },
    }),
  );
  const replay = await reopened.operation(token, 'convert', convert);
  assert.equal(replay.wallet.units.solana, '100000000');
  assert.equal(replay.wallet.brlCents, 0);
});
