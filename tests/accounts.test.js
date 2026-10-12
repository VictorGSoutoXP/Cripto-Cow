import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { mkdtemp, rm, rmdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Store } from '../server/store.js';
import { createApp } from '../server/app.js';
import { digest } from '../server/ledger.js';
import { getAcceptance } from '../server/legal.js';

const password = 'senha-exclusiva-de-teste';
function terms(role = 'account') {
  const { version, hash } = getAcceptance(role);
  return { accepted: true, termsVersion: version, termsHash: hash };
}
function registration(email = 'pessoa@example.test') {
  return { name: 'Participante de teste', email, password, ...terms() };
}
function campaign() {
  return {
    title: 'Campanha individual de teste',
    description: 'Uma campanha fictícia criada para conferir o acesso individual.',
    organization: 'Coletivo fictício',
    location: 'São Paulo, SP',
    category: 'Comunidade',
    deadline: '2099-01-01',
    budget: [{ name: 'Materiais', planned: 100000 }],
    ...terms('organizer'),
  };
}

async function fixture(t, options = {}, path = ':memory:', cleanup = async () => {}) {
  let store = await Store.open({ path });
  let server;
  let base;
  async function start() {
    server = createApp(store, options).listen(0, '127.0.0.1');
    await once(server, 'listening');
    base = `http://127.0.0.1:${server.address().port}/api`;
  }
  await start();
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await store.close();
    await cleanup();
  });
  return {
    get store() {
      return store;
    },
    restart: async () => {
      await new Promise((resolve) => server.close(resolve));
      await store.close();
      store = await Store.open({ path });
      await start();
    },
    client: () => {
      let cookie = '';
      return {
        get cookie() {
          return cookie;
        },
        request: async (path, method = 'GET', input, headers = {}) => {
          const response = await fetch(`${base}${path}`, {
            method,
            headers: { 'Content-Type': 'application/json', Cookie: cookie, ...headers },
            body: input === undefined ? undefined : JSON.stringify(input),
          });
          const setCookie = response.headers.get('set-cookie');
          if (setCookie) cookie = setCookie.split(';')[0];
          return { status: response.status, cookie: setCookie, body: await response.json() };
        },
      };
    },
  };
}

test('cadastro autentica, registra aceite e guarda apenas hash da senha e do token', async (t) => {
  const { client, store } = await fixture(t);
  const first = client();
  const second = client();
  const created = await first.request(
    '/auth/register',
    'POST',
    registration(' Pessoa@Example.Test '),
  );
  assert.equal(created.status, 201);
  assert.equal(created.body.user.email, 'pessoa@example.test');
  assert.equal(created.body.user.role, 'organizer');
  assert.match(created.cookie, /HttpOnly/);
  assert.match(created.cookie, /SameSite=Strict/);
  assert.match(created.cookie, /Path=\//);
  assert.equal(created.body.user.password_hash, undefined);
  const panel = await first.request('/admin');
  assert.equal(panel.status, 200);
  assert.deepEqual(panel.body.campaigns, []);
  assert.deepEqual(panel.body.reports, []);
  assert.equal(panel.body.user.name, registration().name);
  const duplicate = await second.request(
    '/auth/register',
    'POST',
    registration('PESSOA@example.test'),
  );
  assert.equal(duplicate.status, 409);
  assert.equal(duplicate.body.code, 'ACCOUNT_EXISTS');
  assert.equal((await second.request('/admin')).status, 401);
  assert.equal(
    (await second.request('/auth/register', 'POST', registration('outra@example.test'))).status,
    201,
  );
  const users = (await store.execute('SELECT * FROM users')).rows;
  assert.equal(users.length, 2);
  assert.notEqual(users[0].password_hash, users[1].password_hash);
  assert.equal(JSON.stringify(users).includes(password), false);
  const acceptance = JSON.parse(users[0].acceptance);
  assert.equal(acceptance.hash, getAcceptance('account').hash);
  assert.equal(Number.isNaN(Date.parse(acceptance.acceptedAt)), false);
  const sessions = (await store.execute('SELECT * FROM user_sessions')).rows;
  assert.equal(sessions.length, 2);
  assert.ok(sessions.some((row) => row.token_hash === digest(first.cookie.slice(12))));
  assert.equal(JSON.stringify(sessions).includes(first.cookie.slice(12)), false);
});

test('cadastro rejeita senha curta, e-mail inválido, ausência de aceite e tentativa de elevar função', async (t) => {
  const { client, store } = await fixture(t);
  const visitor = client();
  for (const changes of [
    { password: 'curta' },
    { email: 'invalid' },
    { accepted: false },
    { role: 'admin' },
    { name: ' ' },
  ])
    assert.equal(
      (await visitor.request('/auth/register', 'POST', { ...registration(), ...changes })).status,
      400,
    );
  for (const changes of [
    { termsHash: '0'.repeat(64) },
    { termsVersion: 'mvp-1.2' },
    terms('donor'),
  ]) {
    const result = await visitor.request('/auth/register', 'POST', {
      ...registration(),
      ...changes,
    });
    assert.equal(result.status, 409);
    assert.equal(result.body.code, 'TERMS_CHANGED');
  }
  assert.equal((await store.execute('SELECT id FROM users')).rows.length, 0);
});

test('login verifica credenciais, troca o token anterior e logout revoga a sessão', async (t) => {
  const { client } = await fixture(t);
  const member = client();
  await member.request('/auth/register', 'POST', registration());
  const initialCookie = member.cookie;
  const wrong = await member.request('/auth/session', 'POST', {
    email: registration().email,
    password: 'incorreta',
  });
  const missing = await member.request('/auth/session', 'POST', {
    email: 'ausente@example.test',
    password,
  });
  assert.equal(wrong.status, 401);
  assert.deepEqual(wrong.body, missing.body);
  assert.equal((await member.request('/admin')).status, 200);
  const login = await member.request('/auth/session', 'POST', {
    email: 'PESSOA@EXAMPLE.TEST',
    password,
  });
  assert.equal(login.status, 200);
  assert.notEqual(member.cookie, initialCookie);
  assert.equal(
    (await member.request('/admin', 'GET', undefined, { Cookie: initialCookie })).status,
    401,
  );
  const activeCookie = member.cookie;
  assert.equal((await member.request('/auth/session', 'DELETE', {})).status, 200);
  assert.equal(
    (await member.request('/admin', 'GET', undefined, { Cookie: activeCookie })).status,
    401,
  );
  assert.equal(
    (await member.request('/auth/session', 'POST', { email: registration().email, password }))
      .status,
    200,
  );
});

test('dois participantes têm campanhas isoladas e não conseguem moderar nem usar ancoragens alheias', async (t) => {
  const { client, store } = await fixture(t);
  const first = client();
  const second = client();
  await first.request('/auth/register', 'POST', registration('primeira@example.test'));
  await second.request('/auth/register', 'POST', registration('segunda@example.test'));
  const created = await first.request('/campaigns', 'POST', { ...campaign(), ownerId: 'forjado' });
  assert.equal(created.status, 201);
  const id = created.body.id;
  assert.equal(created.body.ownerId, undefined);
  assert.equal(
    (await store.get('campaigns', id)).ownerId,
    (await first.request('/admin')).body.user.id,
  );
  assert.equal((await first.request('/admin')).body.campaigns.length, 1);
  assert.deepEqual((await second.request('/admin')).body.campaigns, []);
  const publication = { status: 'active', reason: 'Campanha fictícia pronta para publicação.' };
  assert.equal((await second.request(`/campaigns/${id}/status`, 'PATCH', publication)).status, 403);
  assert.equal((await second.request(`/campaigns/${id}/expenses`, 'POST', {})).status, 403);
  assert.equal((await second.request(`/campaigns/${id}/anchors/prepare`, 'POST', {})).status, 403);
  assert.equal((await first.request('/expenses/qualquer/decision', 'POST', {})).status, 403);
  assert.equal((await first.request('/reports/qualquer/decision', 'POST', {})).status, 403);
  assert.equal((await first.request(`/campaigns/${id}/status`, 'PATCH', publication)).status, 200);
  const publicPage = await second.request(`/campaigns/${id}`);
  assert.equal(publicPage.status, 200);
  assert.equal(publicPage.body.ownerId, undefined);
  assert.equal(JSON.stringify(publicPage.body).includes('primeira@example.test'), false);
  assert.equal(
    (await first.request('/campaigns')).body.campaigns.find((item) => item.id === id).ownerId,
    undefined,
  );
  await store.save('anchors', {
    id: 'private-anchor',
    campaignId: id,
    status: 'pending',
    count: 1,
    root: '0'.repeat(64),
  });
  assert.equal(
    (
      await second.request('/anchors/private-anchor/submit', 'POST', {
        transaction: 'a'.repeat(60),
      })
    ).status,
    403,
  );
  assert.equal(
    (await second.request('/anchors/private-anchor/confirm', 'POST', { signature: '1'.repeat(88) }))
      .status,
    403,
  );
  assert.equal(
    (await first.request(`/campaigns/${id}/status`, 'PATCH', { ...publication, status: 'frozen' }))
      .status,
    403,
  );
  assert.equal(
    (await first.request('/campaigns/horta-do-amanha/expenses', 'POST', {})).status,
    403,
  );
});

test('moderação acessa campanhas existentes e novas; organizador não pode retomar uma campanha suspensa', async (t) => {
  const { client } = await fixture(t, { password });
  const member = client();
  const moderator = client();
  await member.request('/auth/register', 'POST', registration());
  const created = await member.request('/campaigns', 'POST', campaign());
  const id = created.body.id;
  const publication = { status: 'active', reason: 'Publicação fictícia de teste.' };
  await member.request(`/campaigns/${id}/status`, 'PATCH', publication);
  await moderator.request('/admin/session', 'POST', { password });
  const panel = (await moderator.request('/admin')).body;
  assert.equal(panel.user.role, 'admin');
  assert.ok(panel.campaigns.some((item) => item.id === 'horta-do-amanha'));
  assert.ok(panel.campaigns.some((item) => item.id === id));
  const frozen = await moderator.request(`/campaigns/${id}/status`, 'PATCH', {
    ...publication,
    status: 'frozen',
  });
  assert.equal(frozen.status, 200);
  assert.equal((await member.request(`/campaigns/${id}/status`, 'PATCH', publication)).status, 403);
  assert.equal(
    (await moderator.request(`/campaigns/${id}/status`, 'PATCH', publication)).status,
    200,
  );
});

test('organizador solicita despesa da própria campanha e somente a moderação aprova', async (t) => {
  const { client } = await fixture(t, { password });
  const member = client();
  const moderator = client();
  await member.request('/auth/register', 'POST', registration());
  const created = await member.request('/campaigns', 'POST', campaign());
  const id = created.body.id;
  await member.request(`/campaigns/${id}/status`, 'PATCH', {
    status: 'active',
    reason: 'Publicação para conferir despesas.',
  });
  const contribution = await member.request(`/campaigns/${id}/donations`, 'POST', {
    amount: 10000,
    requestKey: randomUUID(),
    ...terms('donor'),
  });
  assert.equal(contribution.status, 201);
  const budget = (await member.request('/admin')).body.campaigns[0].budget;
  const expense = await member.request(`/campaigns/${id}/expenses`, 'POST', {
    title: 'Compra de materiais fictícios',
    supplier: 'Fornecedor fictício',
    categoryId: budget[0].id,
    amount: 5000,
    evidenceSummary: 'Comprovante demonstrativo para verificar revisão por outra função.',
  });
  assert.equal(expense.status, 201);
  const decision = { approved: true, reason: 'Evidência fictícia conferida pela moderação.' };
  assert.equal(
    (await member.request(`/expenses/${expense.body.id}/decision`, 'POST', decision)).status,
    403,
  );
  await moderator.request('/admin/session', 'POST', { password });
  assert.equal(
    (await moderator.request(`/expenses/${expense.body.id}/decision`, 'POST', decision)).status,
    200,
  );
  const after = (await member.request('/admin')).body.campaigns[0];
  assert.equal(after.expenses[0].status, 'approved');
  assert.equal(after.balance, 5000);
  assert.equal(after.integrity.valid, true);
});

test('conta e sessão individual sobrevivem ao reinício; sessão expirada é recusada', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'cripto-cow-accounts-'));
  const path = join(directory, 'accounts.sqlite');
  const cleanup = async () => {
    for (const suffix of ['', '-wal', '-shm', '-journal'])
      await rm(`${path}${suffix}`, { force: true });
    await rmdir(directory);
  };
  const app = await fixture(t, {}, path, cleanup);
  const member = app.client();
  await member.request('/auth/register', 'POST', registration());
  const id = (await member.request('/admin')).body.user.id;
  await app.restart();
  const restored = await member.request('/admin');
  assert.equal(restored.status, 200);
  assert.equal(restored.body.user.id, id);
  await app.store.execute({
    sql: 'UPDATE user_sessions SET expires_at = ? WHERE user_id = ?',
    args: [Date.now() - 1, id],
  });
  const expired = await member.request('/admin');
  assert.equal(expired.status, 401);
  assert.equal(expired.body.code, 'SESSION_REQUIRED');
});

test('cadastro respeita proteção de origem, cookies seguros e limite de tentativas de acesso', async (t) => {
  const { client } = await fixture(t, { production: true, trustProxy: 1, password });
  const visitor = client();
  assert.equal(
    (
      await visitor.request('/auth/register', 'POST', registration(), {
        Origin: 'https://external.example',
      })
    ).status,
    403,
  );
  const created = await visitor.request('/auth/register', 'POST', registration(), {
    'X-Forwarded-Proto': 'https',
  });
  assert.equal(created.status, 201);
  assert.match(created.cookie, /Secure/);
  for (let attempt = 0; attempt < 9; attempt += 1)
    assert.equal(
      (
        await visitor.request('/auth/session', 'POST', {
          email: registration().email,
          password: 'invalid',
        })
      ).status,
      401,
    );
  const limited = await visitor.request('/auth/session', 'POST', {
    email: registration().email,
    password,
  });
  assert.equal(limited.status, 429);
  assert.equal(limited.body.code, 'AUTH_RATE_LIMIT');
});
