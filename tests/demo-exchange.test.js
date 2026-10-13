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
import { estimateCrypto } from '../src/lib/conversion.ts';

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

test('equivalente automático usa o mesmo valor em reais com precisão de SOL e ZEC', () => {
  assert.equal(estimateCrypto('500', 'solana', 50000), '1.000000000');
  assert.equal(estimateCrypto('500,25', 'zcash', 20000), '2.50125000');
  assert.equal(estimateCrypto('1', 'solana', 30000), '0.003333333');
  for (const value of ['-500', '0', '1e3', '1.001', '10000.01', ''])
    assert.equal(estimateCrypto(value, 'solana', 50000), '');
});

test('falha do CoinGecko usa spot em BRL validado da Coinbase; ativos ou moedas incorretos não viram cotação', async () => {
  const fallback = (spot) =>
    quotes({
      fetchPrices: async () => {
        throw new Error('down');
      },
      fetchSpotPrices: async (url) => ({
        ok: true,
        json: async () => ({
          data: {
            base: url.includes('SOL-') ? 'SOL' : 'ZEC',
            currency: 'BRL',
            amount: '500.25',
            ...spot,
          },
        }),
      }),
    });
  const valid = await fallback({}).get();
  assert.equal(valid.rates.solana.source, 'Coinbase spot');
  assert.equal(valid.rates.zcash.rateCents, 50025);
  assert.equal(valid.rates.zcash.basis, 'market-reference');
  assert.equal(valid.rates.zcash.quotedAt, new Date(now).toISOString());
  for (const invalid of [{ currency: 'USD' }, { base: 'BTC' }, { amount: '-1' }, { amount: 'NaN' }])
    assert.equal((await fallback(invalid).get()).rates.solana.basis, 'fictional');
});

test('doação em reais converte e debita uma única vez, sem deixar saldo cripto intermediário', async (t) => {
  const f = await fixture(t);
  await f.request('/demo-exchange/credit', operation({ amount: '1000' }));
  const quote = await f.quotes.get();
  const input = operation({
    amount: '500',
    network: 'solana',
    quoteId: quote.id,
    campaignId: 'horta-do-amanha',
    ...terms(),
  });
  const responses = await Promise.all(
    Array.from({ length: 3 }, () => f.request('/demo-exchange/donate-brl', input)),
  );
  assert.ok(
    responses.every(
      (r) =>
        r.status === 200 &&
        r.body.amount === '1.000000000' &&
        r.body.brlCents === 50000 &&
        r.body.wallet.brlCents === 50000,
    ),
  );
  assert.equal(responses[0].body.wallet.units.solana, '0');
  assert.equal(responses[0].body.quote.id, quote.id);
  const zec = await f.request('/demo-exchange/donate-brl', {
    ...input,
    network: 'zcash',
    requestKey: randomUUID(),
  });
  assert.equal(zec.body.amount, '2.50000000');
  assert.equal(zec.body.wallet.brlCents, 0);
  assert.equal(zec.body.wallet.units.zcash, '0');
  const campaign = await f.store.campaign(input.campaignId);
  assert.equal(campaign.simulatedCryptoDonations.length, 2);
  assert.equal(verifyDemoReceipts(campaign.ledger, campaign.simulatedCryptoDonations), true);
  // A lost response can be recovered after a price change without a second debit.
  f.quotes.cache = null;
  f.quotes.fetchPrices = async () => {
    throw new Error('offline');
  };
  f.quotes.fetchSpotPrices = f.quotes.fetchPrices;
  assert.equal((await f.request('/demo-exchange/donate-brl', input)).body.amount, '1.000000000');
});

test('conversão automática recusa débito sem saldo, com cotação alterada ou campanha bloqueada', async (t) => {
  const f = await fixture(t);
  const quote = await f.quotes.get();
  const input = operation({
    amount: '500',
    network: 'solana',
    quoteId: quote.id,
    campaignId: 'horta-do-amanha',
    ...terms(),
  });
  assert.equal(
    (await f.request('/demo-exchange/donate-brl', input)).body.code,
    'INSUFFICIENT_DEMO_BALANCE',
  );
  await f.request('/demo-exchange/credit', operation({ amount: '500' }));
  assert.equal(
    (await f.request('/demo-exchange/donate-brl', { ...input, quoteId: 'f'.repeat(64) })).body.code,
    'QUOTE_CHANGED',
  );
  assert.equal(
    (await f.request('/demo-exchange/donate-brl', { ...input, accepted: false })).status,
    400,
  );
  const campaign = await f.store.get('campaigns', input.campaignId);
  await f.store.save('campaigns', { ...campaign, status: 'frozen' });
  assert.equal(
    (await f.request('/demo-exchange/donate-brl', input)).body.code,
    'CAMPAIGN_UNAVAILABLE',
  );
  assert.equal((await f.request('/demo-exchange/wallet', {})).body.brlCents, 50000);
  assert.equal((await f.store.execute('SELECT id FROM demo_crypto_donations')).rows.length, 0);
});

test('falha ao registrar o recibo desfaz o débito em reais da doação automática', async (t) => {
  const f = await fixture(t);
  await f.request('/demo-exchange/credit', operation({ amount: '500' }));
  const quote = await f.quotes.get();
  t.mock.method(f.store, 'append', async () => {
    throw new Error('simulated storage failure');
  });
  const result = await f.request(
    '/demo-exchange/donate-brl',
    operation({
      amount: '500',
      network: 'solana',
      quoteId: quote.id,
      campaignId: 'horta-do-amanha',
      ...terms(),
    }),
  );
  assert.notEqual(result.status, 200);
  assert.equal((await f.request('/demo-exchange/wallet', {})).body.brlCents, 50000);
  assert.equal((await f.store.execute('SELECT id FROM demo_crypto_donations')).rows.length, 0);
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
