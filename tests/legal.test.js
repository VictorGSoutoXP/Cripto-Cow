import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import legalDocuments from '../shared/legal-documents.json' with { type: 'json' };
import { Store } from '../server/store.js';
import { createApp } from '../server/app.js';
import { canonical, digest } from '../server/ledger.js';
import { getAcceptance, getLegalManifest } from '../server/legal.js';

const sha256 = (value) => createHash('sha256').update(canonical(value)).digest('hex');
const terms = (role) => {
  const acceptance = getAcceptance(role);
  return { accepted: true, termsVersion: acceptance.version, termsHash: acceptance.hash };
};
const campaignInput = {
  title: 'Campanha de teste jurídico',
  description: 'Uma campanha fictícia para verificar as políticas aceitas ao publicar.',
  organization: 'Coletivo fictício',
  location: 'São Paulo, SP',
  category: 'Comunidade',
  deadline: '2099-01-01',
  budget: [{ name: 'Materiais', planned: 100000 }],
};

async function fixture(t, options = {}) {
  const store = await Store.open({ path: ':memory:' });
  const server = createApp(store, options).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await store.close();
  });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  let cookie = '';
  return {
    store,
    request: async (path, method = 'GET', body) => {
      const response = await fetch(`${base}${path}`, {
        method,
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (response.headers.get('set-cookie'))
        cookie = response.headers.get('set-cookie').split(';')[0];
      return { status: response.status, body: await response.json() };
    },
  };
}

test('manifesto publica texto e hashes reproduzíveis e mantém minutas fora do aceite', () => {
  const manifest = getLegalManifest();
  assert.deepEqual(manifest.source, legalDocuments.source);
  for (const document of manifest.documents) {
    const { hash, ...content } = document;
    assert.equal(hash, sha256(content));
    assert.equal(content.sections.length > 0, true);
  }
  const documents = legalDocuments.acceptance.documents.map((id) =>
    legalDocuments.documents.find((document) => document.id === id),
  );
  assert.equal(
    documents.every((document) => document.status === 'current'),
    true,
  );
  for (const role of ['donor', 'organizer']) {
    const acceptance = manifest.acceptance[role];
    assert.equal(
      acceptance.hash,
      sha256({ role, version: acceptance.version, text: acceptance.text, documents }),
    );
    assert.deepEqual(
      acceptance.documents,
      documents.map((document) => document.id),
    );
    assert.equal(
      acceptance.documents.some((id) =>
        manifest.documents.some((document) => document.id === id && document.status === 'draft'),
      ),
      false,
    );
    assert.notEqual(
      acceptance.hash,
      sha256({
        role,
        version: acceptance.version,
        text: `${acceptance.text} Alterado.`,
        documents,
      }),
    );
  }
  assert.notEqual(manifest.acceptance.donor.hash, manifest.acceptance.organizer.hash);
  assert.equal(/data:application\/pdf|JVBERi0/.test(JSON.stringify(manifest)), false);
  manifest.documents[0].title = 'Alteração local';
  assert.notEqual(getLegalManifest().documents[0].title, 'Alteração local');
  assert.throws(() => getAcceptance('invalid'), /Tipo de aceite inválido/);
});

test('políticas continuam disponíveis quando o banco está indisponível', async (t) => {
  const { request, store } = await fixture(t);
  await store.close();
  assert.equal((await request('/health')).status, 503);
  const result = await request('/legal');
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, getLegalManifest());
});

test('doação exige versão e hash vigentes sem alterar valores em tentativas desatualizadas', async (t) => {
  const { request, store } = await fixture(t);
  const before = await store.campaign('horta-do-amanha');
  const acceptance = getAcceptance('donor');
  const invalidTerms = [
    { accepted: true },
    { accepted: true, termsVersion: acceptance.version },
    { accepted: true, termsHash: acceptance.hash },
    { ...terms('donor'), termsVersion: 'demo-1.0' },
    { ...terms('donor'), termsHash: digest(`${acceptance.text} Texto anterior.`) },
    { ...terms('organizer') },
  ];
  for (const input of invalidTerms) {
    const result = await request('/campaigns/horta-do-amanha/donations', 'POST', {
      amount: 1000,
      requestKey: randomUUID(),
      ...input,
    });
    assert.equal(result.status, 409);
    assert.equal(result.body.code, 'TERMS_CHANGED');
    assert.match(result.body.error, /Recarregue/);
  }
  assert.deepEqual(await store.campaign('horta-do-amanha'), before);
  assert.equal((await store.list('donations')).length, 0);
  const requestKey = randomUUID();
  const result = await request('/campaigns/horta-do-amanha/donations', 'POST', {
    amount: 1000,
    requestKey,
    ...terms('donor'),
  });
  assert.equal(result.status, 201);
  const record = await store.get('donations', result.body.id);
  assert.equal(record.termsVersion, acceptance.version);
  assert.equal(record.termsHash, acceptance.hash);
  assert.deepEqual(record.termsDocumentIds, acceptance.documents);
  assert.equal(record.termsText, acceptance.text);
  assert.equal(record.releaseRule, before.releaseRule);
  assert.equal(record.surplusRule, before.surplusRule);
  assert.equal(record.simulated, true);
  assert.equal(Number.isNaN(Date.parse(record.acceptedAt)), false);
  const after = await store.campaign('horta-do-amanha');
  assert.equal(after.raised, before.raised + 1000);
  assert.equal(after.integrity.valid, true);
  assert.deepEqual(after.ledger.slice(0, before.ledger.length), before.ledger);
  assert.equal(after.ledger.at(-1).termsText, undefined);
  assert.equal(after.ledger.at(-1).termsHash, undefined);
  assert.equal(JSON.stringify(after.ledger).includes(acceptance.text), false);
});

test('criação exige aceite de organizador vigente e preserva autenticação e modo demo', async (t) => {
  const { request, store } = await fixture(t);
  const count = (await store.list('campaigns')).length;
  assert.equal((await request('/campaigns', 'POST', campaignInput)).status, 401);
  await request('/admin/session', 'POST', {});
  for (const acceptance of [
    { accepted: true },
    { ...terms('organizer'), termsVersion: 'demo-1.0' },
    { ...terms('organizer'), termsHash: '0'.repeat(64) },
    terms('donor'),
  ]) {
    const result = await request('/campaigns', 'POST', { ...campaignInput, ...acceptance });
    assert.equal(result.status, 409);
    assert.equal(result.body.code, 'TERMS_CHANGED');
  }
  assert.equal((await store.list('campaigns')).length, count);
  const result = await request('/campaigns', 'POST', {
    ...campaignInput,
    ...terms('organizer'),
  });
  assert.equal(result.status, 201);
  const record = await store.get('campaigns', result.body.id);
  const acceptance = getAcceptance('organizer');
  assert.equal(record.termsVersion, acceptance.version);
  assert.equal(record.termsHash, acceptance.hash);
  assert.deepEqual(record.termsDocumentIds, acceptance.documents);
  assert.equal(record.termsText, acceptance.text);
  assert.equal(record.simulated, true);
  assert.equal(Number.isNaN(Date.parse(record.acceptedAt)), false);
  const campaign = await store.campaign(record.id);
  assert.equal(campaign.integrity.valid, true);
  assert.equal(campaign.ledger.length, 1);
  assert.equal(campaign.ledger[0].termsText, undefined);
  assert.equal(JSON.stringify(campaign.ledger).includes(acceptance.text), false);

  const disabled = await fixture(t, { demo: false, password: 'test-password' });
  await disabled.request('/admin/session', 'POST', { password: 'test-password' });
  assert.equal(
    (await disabled.request('/campaigns', 'POST', { ...campaignInput, ...terms('organizer') }))
      .status,
    403,
  );
  assert.equal(
    (
      await disabled.request('/campaigns/horta-do-amanha/donations', 'POST', {
        amount: 1000,
        requestKey: randomUUID(),
        ...terms('donor'),
      })
    ).status,
    403,
  );
});

test('repetição de doação antiga não reescreve aceite nem histórico', async (t) => {
  const { request, store } = await fixture(t);
  const id = randomUUID();
  const requestKey = randomUUID();
  const entry = await store.append('horta-do-amanha', {
    type: 'donation',
    amount: 1000,
    referenceId: id,
  });
  const old = await store.save('donations', {
    id,
    campaignId: 'horta-do-amanha',
    amount: 1000,
    requestKey,
    termsVersion: 'demo-1.0',
    surplusRule: 'Regra vigente no aceite anterior',
    acceptedAt: entry.createdAt,
    ledgerId: entry.id,
    simulated: true,
  });
  const before = await store.campaign('horta-do-amanha');
  const result = await request('/campaigns/horta-do-amanha/donations', 'POST', {
    amount: old.amount,
    requestKey,
    ...terms('donor'),
  });
  assert.equal(result.status, 201);
  assert.deepEqual(result.body, old);
  assert.deepEqual(await store.get('donations', id), old);
  assert.deepEqual(await store.campaign('horta-do-amanha'), before);
  const stale = await request('/campaigns/horta-do-amanha/donations', 'POST', {
    amount: old.amount,
    requestKey,
    accepted: true,
    termsVersion: 'demo-1.0',
  });
  assert.equal(stale.status, 409);
  assert.deepEqual(await store.campaign('horta-do-amanha'), before);
});
