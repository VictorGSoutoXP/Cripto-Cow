import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { mkdtemp, rm, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../server/store.js';
import { createApp } from '../server/app.js';
import { getAcceptance } from '../server/legal.js';
import { campaigns, demoDonations } from '../server/seed.js';

async function memory(t, seed = false) {
  const store = await Store.open({ path: ':memory:', seed });
  t.after(() => store.close());
  return store;
}

async function createCampaign(store, id = 'cause', overrides = {}) {
  const source = campaigns.find((campaign) => campaign.id === id) ?? campaigns[0];
  const { raised, donors, expenses, ...fields } = source;
  await store.save('campaigns', {
    ...fields,
    id,
    deadline: '2099-01-01',
    simulated: true,
    ...overrides,
  });
  await store.append(id, { type: 'campaign_created', createdAt: '2026-09-29T10:00:00.000Z' });
}

async function api(t) {
  const store = await memory(t);
  await createCampaign(store);
  const server = createApp(store).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  return {
    store,
    request: async (path, body) => {
      const response = await fetch(`${base}${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return { status: response.status, body: await response.json() };
    },
  };
}

function input(donor, amount = 2500) {
  const acceptance = getAcceptance('donor');
  return {
    amount,
    accepted: true,
    requestKey: randomUUID(),
    termsVersion: acceptance.version,
    termsHash: acceptance.hash,
    ...(donor === undefined ? {} : { donor }),
  };
}

async function file(t) {
  const directory = await mkdtemp(join(tmpdir(), 'cripto-cow-donors-'));
  const path = join(directory, 'store.sqlite');
  const clients = new Set();
  t.after(async () => {
    for (const store of clients) await store.close();
    for (const suffix of ['', '-wal', '-shm', '-journal']) {
      await rm(`${path}${suffix}`, { force: true });
    }
    await rmdir(directory);
  });
  return {
    open: async (seed = false) => {
      const store = await Store.open({ path, seed });
      clients.add(store);
      return store;
    },
    close: async (store) => {
      await store.close();
      clients.delete(store);
    },
  };
}

async function legacyDonation(store, campaignId) {
  const id = randomUUID();
  const entry = await store.append(campaignId, {
    type: 'donation',
    amount: 12345,
    referenceId: id,
    createdAt: '2026-09-30T10:00:00.000Z',
  });
  return store.save('donations', {
    id,
    campaignId,
    amount: entry.amount,
    requestKey: randomUUID(),
    ledgerId: entry.id,
    acceptedAt: entry.createdAt,
    termsVersion: 'demo-1.0',
    surplusRule: 'Regra antiga preservada',
    simulated: true,
  });
}

test('pessoa e empresa usam nome público normalizado; anonimato não guarda nome', async (t) => {
  const store = await memory(t);
  await createCampaign(store);
  const person = await store.donate('cause', 2500, randomUUID(), true, {
    type: 'person',
    name: '  Pessoa de exemplo  ',
  });
  const company = await store.donate('cause', 49900, randomUUID(), true, {
    type: 'company',
    name: '  Empresa de exemplo  ',
  });
  const anonymous = await store.donate('cause', 1700, randomUUID(), true);
  assert.deepEqual(person.donor, { type: 'person', name: 'Pessoa de exemplo' });
  assert.deepEqual(company.donor, { type: 'company', name: 'Empresa de exemplo' });
  assert.deepEqual(anonymous.donor, { type: 'anonymous' });
  assert.equal((await store.campaign('cause')).raised, 54100);
  const before = await store.entries('cause');
  for (const donor of [
    { type: 'anonymous', name: 'Nome que não deve ser público' },
    { type: 'person' },
    { type: 'person', name: ' x ' },
    { type: 'company', name: ' '.repeat(5) },
    { type: 'company', name: 'x'.repeat(61) },
    { type: 'verified', name: 'Identidade sem verificação' },
    { type: 'person', name: 123 },
  ]) {
    await assert.rejects(() => store.donate('cause', 1000, randomUUID(), true, donor));
  }
  assert.deepEqual(await store.entries('cause'), before);
});

test('mesma chave não altera o perfil e uma doação legada continua anônima sem regravação', async (t) => {
  const store = await memory(t);
  await createCampaign(store);
  const key = randomUUID();
  const donor = { type: 'person', name: 'Pessoa de exemplo' };
  const first = await store.donate('cause', 3500, key, true, donor);
  assert.deepEqual(
    await store.donate('cause', 3500, key, true, { ...donor, name: ` ${donor.name} ` }),
    first,
  );
  for (const changed of [
    { type: 'person', name: 'Outra pessoa de exemplo' },
    { type: 'company', name: donor.name },
    { type: 'anonymous' },
  ]) {
    await assert.rejects(() => store.donate('cause', 3500, key, true, changed));
  }
  const legacy = await legacyDonation(store, 'cause');
  assert.deepEqual(await store.donate('cause', legacy.amount, legacy.requestKey, true), legacy);
  assert.deepEqual(await store.get('donations', legacy.id), legacy);
  await assert.rejects(() => store.donate('cause', legacy.amount, legacy.requestKey, true, donor));
  assert.equal(
    (await store.entries('cause')).filter((entry) => entry.type === 'donation').length,
    2,
  );
});

test('API valida os três perfis, mantém anonimato por padrão e rejeita identificação inválida', async (t) => {
  const { request, store } = await api(t);
  for (const donor of [
    undefined,
    { type: 'anonymous' },
    { type: 'person', name: ' Pessoa API de exemplo ' },
    { type: 'company', name: 'Empresa API de exemplo' },
  ]) {
    const result = await request('/campaigns/cause/donations', input(donor));
    assert.equal(result.status, 201);
    assert.deepEqual(
      result.body.donor,
      donor?.name ? { ...donor, name: donor.name.trim() } : { type: 'anonymous' },
    );
  }
  const before = await store.entries('cause');
  for (const donor of [
    { type: 'anonymous', name: 'Não publicar' },
    { type: 'person', name: 'x' },
    { type: 'person', name: 'x'.repeat(61) },
    { type: 'company' },
    { type: 'business', name: 'Empresa inválida' },
    null,
  ]) {
    assert.equal((await request('/campaigns/cause/donations', input(donor))).status, 400);
  }
  assert.deepEqual(await store.entries('cause'), before);
});

test('identificação pública usa projeção segura e fica fora do ledger e da lista resumida', async (t) => {
  const { request, store } = await api(t);
  const payload = input({ type: 'company', name: 'Empresa Pública de Exemplo' }, 17325);
  const result = await request('/campaigns/cause/donations', payload);
  assert.equal(result.status, 201);
  const saved = await store.get('donations', result.body.id);
  assert.ok(saved.acceptedAt);
  assert.equal(saved.termsHash, payload.termsHash);
  assert.equal(saved.requestKey, payload.requestKey);
  const detail = await request('/campaigns/cause');
  assert.equal(detail.status, 200);
  const donation = detail.body.donations.find((item) => item.id === saved.id);
  assert.deepEqual(donation, {
    id: saved.id,
    ledgerId: saved.ledgerId,
    donor: { type: 'company', name: 'Empresa Pública de Exemplo' },
    simulated: true,
  });
  const publicJson = JSON.stringify(detail.body);
  for (const privateValue of [payload.requestKey, payload.termsHash, saved.termsText]) {
    assert.equal(publicJson.includes(privateValue), false);
  }
  const summary = await request('/campaigns');
  assert.equal(
    summary.body.campaigns.find((campaign) => campaign.id === 'cause').donations,
    undefined,
  );
  assert.equal(JSON.stringify(summary.body).includes('Empresa Pública de Exemplo'), false);
  const exported = await request('/campaigns/cause/ledger');
  assert.equal(exported.status, 200);
  assert.equal(JSON.stringify(exported.body).includes('Empresa Pública de Exemplo'), false);
  assert.equal(
    exported.body.entries.some((entry) => Object.hasOwn(entry, 'donor')),
    false,
  );
  assert.equal(detail.body.integrity.valid, true);
});

test('seed combina valores distintos e perfis fictícios sem fabricar aceites jurídicos', async (t) => {
  const store = await memory(t, true);
  const originals = {
    'horta-do-amanha': { raised: 2845000, donors: 126 },
    'patas-em-casa': { raised: 1678000, donors: 83 },
    recomecar: { raised: 4210000, donors: 164 },
  };
  for (const [id, original] of Object.entries(originals)) {
    const examples = demoDonations[id];
    assert.equal(examples.length, 8);
    assert.ok(new Set(examples.map((item) => item.amount)).size >= 5);
    assert.deepEqual(
      new Set(examples.map((item) => item.donor.type)),
      new Set(['anonymous', 'person', 'company']),
    );
    const campaign = await store.campaign(id);
    assert.equal(
      campaign.raised,
      original.raised + examples.reduce((sum, item) => sum + item.amount, 0),
    );
    assert.equal(campaign.donors, original.donors + examples.length);
    const baseAmounts = campaign.ledger
      .filter((item) => item.type === 'donation')
      .slice(0, original.donors)
      .map((item) => item.amount);
    assert.equal(baseAmounts.length, original.donors);
    assert.equal(
      baseAmounts.reduce((sum, amount) => sum + amount, 0),
      original.raised,
    );
    assert.ok(new Set(baseAmounts).size >= 5);
    assert.ok(
      baseAmounts.every(
        (amount) => Number.isSafeInteger(amount) && amount >= 100 && amount <= 1000000,
      ),
    );
    const records = (await store.list('donations', id)).filter(
      (item) => item.seedVersion === 'demo-donors-v1',
    );
    assert.equal(records.length, 8);
    for (const record of records) {
      assert.equal(record.example, true);
      assert.equal(record.simulated, true);
      for (const field of [
        'acceptedAt',
        'termsVersion',
        'termsHash',
        'termsText',
        'termsDocumentIds',
      ]) {
        assert.equal(Object.hasOwn(record, field), false);
      }
      const entry = campaign.ledger.find((item) => item.id === record.ledgerId);
      assert.equal(entry.amount, record.amount);
      assert.equal(entry.referenceId, record.id);
      assert.equal(Object.hasOwn(entry, 'donor'), false);
    }
    assert.equal(campaign.integrity.valid, true);
  }
});

test('migração acrescenta exemplos uma vez e preserva todo o prefixo e doações antigas ao reabrir', async (t) => {
  const database = await file(t);
  const first = await database.open();
  const snapshots = new Map();
  const legacy = new Map();
  for (const campaign of campaigns) {
    await createCampaign(first, campaign.id);
    legacy.set(campaign.id, await legacyDonation(first, campaign.id));
    snapshots.set(campaign.id, await first.entries(campaign.id));
  }
  await createCampaign(first, 'campanha-personalizada');
  const customSnapshot = await first.campaign('campanha-personalizada');
  const second = await database.open();
  await Promise.all([first.seed(), second.seed()]);
  const migrated = new Map();
  for (const campaign of campaigns) {
    const snapshot = snapshots.get(campaign.id);
    const detail = await first.campaign(campaign.id);
    assert.deepEqual(detail.ledger.slice(0, snapshot.length), snapshot);
    assert.equal(detail.ledger.length, snapshot.length + 8);
    assert.equal(detail.integrity.valid, true);
    assert.deepEqual(
      await first.get('donations', legacy.get(campaign.id).id),
      legacy.get(campaign.id),
    );
    assert.equal(
      (await first.list('donations', campaign.id)).filter(
        (item) => item.seedVersion === 'demo-donors-v1',
      ).length,
      8,
    );
    migrated.set(campaign.id, detail);
  }
  assert.deepEqual(await first.campaign('campanha-personalizada'), customSnapshot);
  await database.close(first);
  await database.close(second);
  const reopened = await database.open(true);
  for (const [id, snapshot] of migrated) assert.deepEqual(await reopened.campaign(id), snapshot);
  assert.deepEqual(await reopened.campaign('campanha-personalizada'), customSnapshot);
});

test('migração não acrescenta exemplos em campanhas encerradas, suspensas, privadas ou reais', async (t) => {
  for (const overrides of [
    { status: 'closed' },
    { status: 'frozen' },
    { status: 'draft' },
    { simulated: false },
  ]) {
    await t.test(JSON.stringify(overrides), async (t) => {
      const store = await memory(t);
      for (const campaign of campaigns) await createCampaign(store, campaign.id, overrides);
      const before = await Promise.all(campaigns.map((campaign) => store.campaign(campaign.id)));
      await store.seed();
      assert.deepEqual(
        await Promise.all(campaigns.map((campaign) => store.campaign(campaign.id))),
        before,
      );
      assert.equal((await store.list('donations')).length, 0);
    });
  }
});

test('falha na migração desfaz todos os exemplos e permite reiniciar sem duplicações', async (t) => {
  const store = await memory(t);
  for (const campaign of campaigns) await createCampaign(store, campaign.id);
  const before = await Promise.all(campaigns.map((campaign) => store.campaign(campaign.id)));
  await store.db.execute(`
    CREATE TRIGGER reject_demo_donor BEFORE INSERT ON donations
    WHEN NEW.campaign_id = 'patas-em-casa'
    BEGIN SELECT RAISE(ABORT, 'Exemplo indisponível para teste'); END
  `);
  await assert.rejects(() => store.seed(), /Exemplo indisponível para teste/);
  assert.deepEqual(
    await Promise.all(campaigns.map((campaign) => store.campaign(campaign.id))),
    before,
  );
  assert.equal((await store.list('donations')).length, 0);
  await store.db.execute('DROP TRIGGER reject_demo_donor');
  await store.seed();
  await store.seed();
  assert.equal((await store.list('donations')).length, 24);
  for (const campaign of campaigns)
    assert.equal((await store.campaign(campaign.id)).integrity.valid, true);
});
