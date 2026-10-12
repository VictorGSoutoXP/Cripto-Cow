import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import bs58 from 'bs58';
import { Keypair } from '@solana/web3.js';
import { ed25519 } from '@noble/curves/ed25519';
import { secp256k1 } from '@noble/curves/secp256k1';
import { Store } from '../server/store.js';
import { createApp } from '../server/app.js';
import { getAcceptance } from '../server/legal.js';
import { ProfileWallets } from '../server/profile-wallets.js';
import { validateZcashAddress, verifyZcashMessage, zcashPaymentRequest } from '../server/zcash.js';

const password = 'senha-privada-de-teste';
const sha256 = (value) => createHash('sha256').update(value).digest();
const doubleHash = (value) => sha256(sha256(value));
const zcashKey = new Uint8Array(32).fill(7);
function zcashAddress(key = zcashKey, compressed = true, prefix = [0x1d, 0x25]) {
  const publicKey = secp256k1.getPublicKey(key, compressed);
  const payload = Buffer.concat([
    Buffer.from(prefix),
    createHash('ripemd160').update(sha256(publicKey)).digest(),
  ]);
  return bs58.encode(Buffer.concat([payload, doubleHash(payload).subarray(0, 4)]));
}
function compact(value) {
  const bytes = Buffer.from(value);
  const size =
    bytes.length < 253
      ? Buffer.from([bytes.length])
      : Buffer.from([253, bytes.length & 255, bytes.length >> 8]);
  return Buffer.concat([size, bytes]);
}
function zcashSignature(
  message,
  key = zcashKey,
  compressed = true,
  magic = 'Zcash Signed Message:\n',
) {
  // Independent wire encoding of the legacy CHashWriter message format.
  const hash = doubleHash(Buffer.concat([compact(magic), compact(message)]));
  const signed = secp256k1.sign(hash, key, { prehash: false });
  return Buffer.concat([
    Buffer.from([27 + signed.recovery + (compressed ? 4 : 0)]),
    Buffer.from(signed.toCompactRawBytes()),
  ]).toString('base64');
}

async function fixture(t) {
  const store = await Store.open({ path: ':memory:' });
  const server = createApp(store, { password }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}/api`;
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await store.close();
  });
  function client() {
    let cookie = '';
    return async (path, method = 'GET', body, headers = {}) => {
      const response = await fetch(`${base}${path}`, {
        method,
        headers: { 'Content-Type': 'application/json', Cookie: cookie, ...headers },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (response.headers.get('set-cookie'))
        cookie = response.headers.get('set-cookie').split(';')[0];
      return { status: response.status, body: await response.json() };
    };
  }
  async function register(request, email = 'perfil@example.test') {
    const consent = getAcceptance('account');
    return request('/auth/register', 'POST', {
      email,
      name: 'Perfil de teste',
      password,
      accepted: true,
      termsVersion: consent.version,
      termsHash: consent.hash,
    });
  }
  return { store, client, register };
}

test('recuperação usa código privado, troca senha, revoga sessões e não permite reutilizar código', async (t) => {
  const { client, register, store } = await fixture(t);
  const member = client();
  const visitor = client();
  const created = await register(member);
  const code = created.body.recoveryCode;
  assert.match(code, /^[a-f0-9]{8}(?:-[a-f0-9]{8}){5}$/);
  assert.equal(JSON.stringify((await member('/profile')).body).includes(code), false);
  assert.equal(
    JSON.stringify((await store.execute('SELECT * FROM user_recovery')).rows).includes(
      code.replaceAll('-', ''),
    ),
    false,
  );
  const newPassword = 'uma-nova-senha-de-teste';
  const wrong = await visitor('/auth/recovery', 'POST', {
    email: 'perfil@example.test',
    code: '0'.repeat(48),
    password: newPassword,
  });
  const missing = await visitor('/auth/recovery', 'POST', {
    email: 'inexistente@example.test',
    code: '0'.repeat(48),
    password: newPassword,
  });
  assert.equal(wrong.status, 400);
  assert.deepEqual(wrong.body, missing.body);
  const recovered = await visitor('/auth/recovery', 'POST', {
    email: 'PERFIL@EXAMPLE.TEST',
    code,
    password: newPassword,
  });
  assert.equal(recovered.status, 200);
  assert.notEqual(recovered.body.recoveryCode, code);
  assert.equal((await member('/admin')).status, 401);
  assert.equal((await visitor('/admin')).status, 200);
  assert.equal(
    (await member('/auth/recovery', 'POST', { email: 'perfil@example.test', code, password }))
      .status,
    400,
  );
  assert.equal(
    (await member('/auth/session', 'POST', { email: 'perfil@example.test', password })).status,
    401,
  );
  assert.equal(
    (await member('/auth/session', 'POST', { email: 'perfil@example.test', password: newPassword }))
      .status,
    200,
  );
});

test('perfil altera nome, protege senha e encerramento remove sessões e dados privados sem apagar ledger', async (t) => {
  const { client, register, store } = await fixture(t);
  const member = client();
  const otherSession = client();
  const registered = await register(member);
  const userId = registered.body.user.id;
  await otherSession('/auth/session', 'POST', { email: 'perfil@example.test', password });
  assert.equal((await member('/profile', 'PATCH', { name: 'Nome atualizado' })).status, 200);
  assert.equal((await member('/profile')).body.user.name, 'Nome atualizado');
  assert.equal((await member('/profile', 'PATCH', { name: 'X', role: 'admin' })).status, 400);
  assert.equal(
    (await member('/profile/password', 'POST', { currentPassword: 'errada', password })).status,
    400,
  );
  const newPassword = 'senha-alterada-de-teste';
  const changed = await member('/profile/password', 'POST', {
    currentPassword: password,
    password: newPassword,
  });
  assert.equal(changed.status, 200);
  assert.ok(changed.body.recoveryCode);
  assert.equal((await otherSession('/admin')).status, 401);
  const consent = getAcceptance('organizer');
  const campaign = await member('/campaigns', 'POST', {
    title: 'Campanha de uma conta encerrada',
    description: 'Campanha demonstrativa para preservar o histórico após encerrar uma conta.',
    organization: 'Coletivo fictício',
    location: 'São Paulo, SP',
    category: 'Comunidade',
    deadline: '2099-01-01',
    budget: [{ name: 'Materiais', planned: 10000 }],
    accepted: true,
    termsVersion: consent.version,
    termsHash: consent.hash,
  });
  assert.equal(campaign.status, 201);
  const ownHistory = await store.campaign(campaign.body.id);
  const baseline = await store.campaign('horta-do-amanha');
  assert.equal((await member('/profile', 'DELETE', { password: 'errada' })).status, 400);
  assert.equal((await member('/profile', 'DELETE', { password: newPassword })).status, 200);
  assert.equal((await member('/admin')).status, 401);
  assert.equal(
    (await store.execute({ sql: 'SELECT id FROM users WHERE id = ?', args: [userId] })).rows.length,
    0,
  );
  assert.equal((await store.execute('SELECT * FROM user_sessions')).rows.length, 0);
  assert.equal((await store.execute('SELECT * FROM user_recovery')).rows.length, 0);
  assert.deepEqual(await store.campaign('horta-do-amanha'), baseline);
  assert.deepEqual(await store.campaign(campaign.body.id), ownHistory);
  const newAccount = await register(otherSession);
  assert.equal(newAccount.status, 201);
  assert.notEqual(newAccount.body.user.id, userId);
  assert.deepEqual((await otherSession('/admin')).body.campaigns, []);
});

test('preparação de ancoragem pelo participante recusa endereço sem vínculo antes de consultar RPC', async (t) => {
  const { client, register } = await fixture(t);
  const member = client();
  await register(member);
  const consent = getAcceptance('organizer');
  const created = await member('/campaigns', 'POST', {
    title: 'Campanha para ancoragem individual',
    description: 'Uma causa fictícia para verificar o vínculo exigido antes de ancorar.',
    organization: 'Coletivo fictício',
    location: 'São Paulo, SP',
    category: 'Comunidade',
    deadline: '2099-01-01',
    budget: [{ name: 'Materiais', planned: 10000 }],
    accepted: true,
    termsVersion: consent.version,
    termsHash: consent.hash,
  });
  const wallet = Keypair.fromSeed(new Uint8Array(32).fill(9)).publicKey.toBase58();
  const result = await member(`/campaigns/${created.body.id}/anchors/prepare`, 'POST', { wallet });
  assert.equal(result.status, 403);
  assert.equal(result.body.code, 'WALLET_NOT_LINKED');
});

test('vínculo Solana exige assinatura, conta correta e desafio único e expira', async (t) => {
  const { client, register, store } = await fixture(t);
  const first = client();
  const second = client();
  await register(first);
  await register(second, 'outro@example.test');
  const key = Keypair.fromSeed(new Uint8Array(32).fill(3));
  const address = key.publicKey.toBase58();
  const prepared = await first(
    '/profile/wallets/challenge',
    'POST',
    { network: 'solana', address },
    { Origin: 'http://127.0.0.1:5173' },
  );
  assert.equal(prepared.status, 200);
  assert.match(prepared.body.message, /Site: http:\/\/127.0.0.1:5173/);
  const signature = Buffer.from(
    ed25519.sign(Buffer.from(prepared.body.message), key.secretKey.subarray(0, 32)),
  ).toString('base64');
  assert.equal(
    (await second('/profile/wallets/confirm', 'POST', { id: prepared.body.id, signature })).status,
    409,
  );
  assert.equal(
    (
      await first('/profile/wallets/confirm', 'POST', {
        id: prepared.body.id,
        signature: Buffer.alloc(64).toString('base64'),
      })
    ).status,
    400,
  );
  const linked = await first('/profile/wallets/confirm', 'POST', {
    id: prepared.body.id,
    signature,
  });
  assert.equal(linked.status, 200);
  assert.equal(linked.body.wallets[0].address, address);
  assert.equal(
    (await first('/profile/wallets/confirm', 'POST', { id: prepared.body.id, signature })).status,
    409,
  );
  const duplicate = (
    await second('/profile/wallets/challenge', 'POST', { network: 'solana', address })
  ).body;
  const duplicateSignature = Buffer.from(
    ed25519.sign(Buffer.from(duplicate.message), key.secretKey.subarray(0, 32)),
  ).toString('base64');
  const denied = await second('/profile/wallets/confirm', 'POST', {
    id: duplicate.id,
    signature: duplicateSignature,
  });
  assert.equal(denied.status, 409);
  assert.equal(denied.body.code, 'WALLET_IN_USE');
  const expired = (
    await first('/profile/wallets/challenge', 'POST', { network: 'solana', address })
  ).body;
  await store.execute({
    sql: 'UPDATE wallet_challenges SET expires_at = 0 WHERE id = ?',
    args: [expired.id],
  });
  assert.equal(
    (await first('/profile/wallets/confirm', 'POST', { id: expired.id, signature })).status,
    409,
  );
  assert.deepEqual((await second('/profile')).body.wallets, []);
  assert.equal(
    (await first('/profile/wallets/solana', 'DELETE', { password: 'incorreta' })).status,
    400,
  );
  assert.equal((await first('/profile/wallets/solana', 'DELETE', { password })).status, 200);
  assert.deepEqual((await first('/profile')).body.wallets, []);
});

test('vínculo Zcash verifica mensagem testnet e gera somente pedido ZIP 321 com precisão até oito casas', async (t) => {
  const { client, register } = await fixture(t);
  const member = client();
  await register(member);
  const address = zcashAddress();
  assert.equal(validateZcashAddress(address), address);
  const prepared = (
    await member('/profile/wallets/challenge', 'POST', { network: 'zcash', address })
  ).body;
  const confirmed = await member('/profile/wallets/confirm', 'POST', {
    id: prepared.id,
    signature: zcashSignature(prepared.message),
  });
  assert.equal(confirmed.status, 200);
  assert.equal(confirmed.body.wallets[0].network, 'zcash');
  const result = await member('/profile/wallets/zcash/request', 'POST', { amount: '0.00000001' });
  assert.equal(result.status, 200);
  assert.equal(result.body.reconciled, false);
  assert.equal(result.body.uri, `zcash:${address}?amount=0.00000001&label=Cripto%20Cow%20testnet`);
  for (const amount of ['0', '-1', '1e-8', '0.000000001', '1&amount=999', '21000001'])
    assert.equal((await member('/profile/wallets/zcash/request', 'POST', { amount })).status, 400);
  assert.equal(
    (
      await member('/profile/wallets/challenge', 'POST', {
        network: 'zcash',
        address: zcashAddress(zcashKey, true, [0x1c, 0xb8]),
      })
    ).status,
    400,
  );
});

test('assinaturas Zcash comprimidas e não comprimidas usam a rede e mensagem corretas', () => {
  for (const compressed of [true, false]) {
    const address = zcashAddress(zcashKey, compressed);
    for (const message of ['Prova de posse da carteira', 'Mensagem com acentuação '.repeat(30)]) {
      const signature = zcashSignature(message, zcashKey, compressed);
      assert.equal(verifyZcashMessage(address, message, signature), true);
      assert.equal(verifyZcashMessage(address, `${message}!`, signature), false);
      assert.equal(
        verifyZcashMessage(
          address,
          message,
          zcashSignature(message, zcashKey, compressed, 'Bitcoin Signed Message:\n'),
        ),
        false,
      );
    }
  }
  assert.throws(() => validateZcashAddress(zcashAddress().slice(0, -1) + '1'), /testnet válido/);
  assert.throws(() => zcashPaymentRequest(zcashAddress(), '0.1&memo=bad'), /valor/);
});

test('carteiras persistem em uma nova instância do serviço e substituição requer nova assinatura', async (t) => {
  const { client, register, store } = await fixture(t);
  const member = client();
  const created = await register(member);
  const wallets = new ProfileWallets(store);
  const firstKey = Keypair.fromSeed(new Uint8Array(32).fill(4));
  const secondKey = Keypair.fromSeed(new Uint8Array(32).fill(5));
  for (const key of [firstKey, secondKey]) {
    const prepared = await wallets.prepare(
      created.body.user.id,
      'solana',
      key.publicKey.toBase58(),
      'https://example.test',
    );
    const signature = Buffer.from(
      ed25519.sign(Buffer.from(prepared.message), key.secretKey.subarray(0, 32)),
    ).toString('base64');
    await wallets.confirm(created.body.user.id, prepared.id, signature);
  }
  const persisted = await new ProfileWallets(store).list(created.body.user.id);
  assert.equal(persisted.length, 1);
  assert.equal(persisted[0].address, secondKey.publicKey.toBase58());
  assert.equal((await store.execute('SELECT * FROM wallet_challenges')).rows.length, 0);
  const json = JSON.stringify(persisted);
  assert.equal(json.includes(Buffer.from(secondKey.secretKey).toString('hex')), false);
});
