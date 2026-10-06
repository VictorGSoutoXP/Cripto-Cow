import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { Keypair } from '@solana/web3.js';
import { Store } from '../server/store.js';
import { createApp } from '../server/app.js';

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
    request: async (path, method = 'GET', body, headers = {}) => {
      const response = await fetch(`${base}${path}`, {
        method,
        headers: { 'Content-Type': 'application/json', Cookie: cookie, ...headers },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (response.headers.get('set-cookie'))
        cookie = response.headers.get('set-cookie').split(';')[0];
      return {
        status: response.status,
        cookie: response.headers.get('set-cookie'),
        body: await response.json(),
      };
    },
  };
}

test('erro numérico do RPC mantém resposta JSON recuperável sem expor detalhes', async (t) => {
  const rpc = createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const { id } = JSON.parse(raw);
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        jsonrpc: '2.0',
        id,
        error: { code: -32005, message: 'private-rpc-detail' },
      }),
    );
  }).listen(0, '127.0.0.1');
  await once(rpc, 'listening');
  t.after(() => new Promise((resolve) => rpc.close(resolve)));
  const { request } = await fixture(t, {
    password: 'test-password',
    rpcUrl: `http://127.0.0.1:${rpc.address().port}`,
  });
  await request('/admin/session', 'POST', { password: 'test-password' });
  const result = await request('/campaigns/horta-do-amanha/anchors/prepare', 'POST', {
    wallet: Keypair.generate().publicKey.toBase58(),
  });
  assert.equal(result.status, 503);
  assert.equal(result.body.code, 'RPC_UNAVAILABLE');
  assert.equal(JSON.stringify(result.body).includes('private-rpc-detail'), false);
});

test('painel exige sessão, senha é verificada e origem externa é recusada', async (t) => {
  const { request } = await fixture(t, { password: 'test-password' });
  assert.equal((await request('/admin')).status, 401);
  assert.equal((await request('/admin/session', 'POST', { password: 'errada' })).status, 401);
  assert.equal(
    (
      await request(
        '/admin/session',
        'POST',
        { password: 'test-password' },
        { Origin: 'https://external.example' },
      )
    ).status,
    403,
  );
  assert.equal(
    (await request('/admin/session', 'POST', { password: 'test-password' })).status,
    200,
  );
  assert.equal((await request('/admin')).status, 200);
  await request('/admin/session', 'DELETE', {});
  assert.equal((await request('/admin')).status, 401);
});

test('denúncia não expõe motivo no painel público nem suspende automaticamente', async (t) => {
  const { request } = await fixture(t);
  const result = await request('/campaigns/horta-do-amanha/reports', 'POST', {
    reason: 'Inconsistência fictícia para análise privada.',
  });
  assert.equal(result.status, 201);
  assert.equal(result.body.reason, undefined);
  const campaign = (await request('/campaigns/horta-do-amanha')).body;
  assert.equal(campaign.status, 'active');
  assert.equal(JSON.stringify(campaign).includes('análise privada'), false);
});

test('validação recusa centavos fracionários e ausência de aceite', async (t) => {
  const { request } = await fixture(t);
  assert.equal(
    (
      await request('/campaigns/horta-do-amanha/donations', 'POST', {
        amount: 100.5,
        accepted: true,
        requestKey: randomUUID(),
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request('/campaigns/horta-do-amanha/donations', 'POST', {
        amount: 1000,
        accepted: false,
        requestKey: randomUUID(),
      })
    ).status,
    400,
  );
});

test('campanha criada fica privada até publicação sem selo de identidade', async (t) => {
  const { request } = await fixture(t);
  await request('/admin/session', 'POST', {});
  const result = await request('/campaigns', 'POST', {
    title: 'Campanha de teste',
    description: 'Uma causa fictícia para testar o processo de publicação.',
    organization: 'Coletivo fictício',
    location: 'São Paulo, SP',
    category: 'Comunidade',
    deadline: '2099-01-01',
    budget: [{ name: 'Materiais', planned: 100000 }],
    accepted: true,
  });
  assert.equal(result.status, 201);
  assert.equal(result.body.status, 'draft');
  assert.equal((await request(`/campaigns/${result.body.id}`)).status, 404);
  assert.equal((await request(`/campaigns/${result.body.id}/ledger`)).status, 404);
  const published = await request(`/campaigns/${result.body.id}/status`, 'PATCH', {
    status: 'active',
    reason: 'Campanha fictícia revisada para publicação.',
  });
  assert.equal(published.status, 200);
  assert.equal(published.body.verified, false);
  assert.equal((await request(`/campaigns/${result.body.id}`)).status, 200);
});

test('modo demonstrativo desativado bloqueia entrada de valores', async (t) => {
  const { request } = await fixture(t, { demo: false });
  assert.equal(
    (
      await request('/campaigns/horta-do-amanha/donations', 'POST', {
        amount: 1000,
        accepted: true,
        requestKey: randomUUID(),
      })
    ).status,
    403,
  );
});

test('proxy HTTPS mantém cookie seguro e produção não permite painel sem senha', async (t) => {
  const { request } = await fixture(t, {
    production: true,
    trustProxy: 1,
    password: 'a-secure-test-password',
  });
  assert.equal((await request('/admin/session', 'POST', {})).status, 401);
  const response = await request(
    '/admin/session',
    'POST',
    { password: 'a-secure-test-password' },
    { 'X-Forwarded-Proto': 'https' },
  );
  assert.equal(response.status, 200);
  assert.match(response.cookie, /HttpOnly/);
  assert.match(response.cookie, /Secure/);
  assert.match(response.cookie, /SameSite=Strict/);
  assert.equal((await request('/admin')).status, 200);
});

test('health check confirma banco acessível e fica indisponível após encerramento', async (t) => {
  const { request, store } = await fixture(t);
  assert.equal((await request('/health')).status, 200);
  await store.close();
  assert.equal((await request('/health')).status, 503);
});

test('encerramento não descarta saldo sem executar a regra da sobra', async (t) => {
  const { request } = await fixture(t);
  await request('/admin/session', 'POST', {});
  assert.equal(
    (
      await request('/campaigns/horta-do-amanha/status', 'PATCH', {
        status: 'closed',
        reason: 'Tentativa de encerramento com saldo.',
      })
    ).status,
    400,
  );
});

test('confirmar ancoragem informa código estável para pedido ausente ou histórico incompatível', async (t) => {
  const { request, store } = await fixture(t);
  await request('/admin/session', 'POST', {});
  const signature = '1'.repeat(88);
  const missing = await request(`/anchors/${randomUUID()}/confirm`, 'POST', { signature });
  assert.equal(missing.status, 404);
  assert.equal(missing.body.code, 'ANCHOR_NOT_FOUND');
  const anchor = await store.save('anchors', {
    id: randomUUID(),
    campaignId: 'horta-do-amanha',
    root: '0'.repeat(64),
    count: 1,
    status: 'pending',
  });
  const mismatch = await request(`/anchors/${anchor.id}/confirm`, 'POST', { signature });
  assert.equal(mismatch.status, 400);
  assert.equal(mismatch.body.code, 'ANCHOR_HISTORY_MISMATCH');
  assert.equal((await store.get('anchors', anchor.id)).status, 'pending');
});
