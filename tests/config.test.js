import test from 'node:test';
import assert from 'node:assert/strict';
import { readConfig } from '../server/config.js';

const hosted = {
  RENDER: 'true',
  NODE_ENV: 'production',
  PORT: '10000',
  ADMIN_PASSWORD: 'a-secure-test-password',
  TURSO_DATABASE_URL: 'libsql://example.turso.io',
  TURSO_AUTH_TOKEN: 'test-token',
};

test('configuração local mantém SQLite e loopback', () => {
  const config = readConfig({});
  assert.equal(config.host, '127.0.0.1');
  assert.equal(config.database.path, './data/elo.sqlite');
  assert.equal(config.database.url, undefined);
  assert.equal(config.trustProxy, false);
  const example = readConfig({ TURSO_DATABASE_URL: '', TURSO_AUTH_TOKEN: '   ' });
  assert.equal(example.database.url, undefined);
  assert.equal(example.database.authToken, undefined);
});

test('Render usa porta atribuída, host público, proxy HTTPS e Turso', () => {
  const config = readConfig(hosted);
  assert.equal(config.host, '0.0.0.0');
  assert.equal(config.port, 10000);
  assert.equal(config.trustProxy, 1);
  assert.equal(config.database.url, hosted.TURSO_DATABASE_URL);
  assert.equal(config.database.seed, true);
});

test('Render não inicia com arquivo temporário ou configuração incompleta', () => {
  assert.throws(
    () => readConfig({ ...hosted, TURSO_DATABASE_URL: undefined, TURSO_AUTH_TOKEN: undefined }),
    /No Render/,
  );
  assert.throws(() => readConfig({ ...hosted, TURSO_AUTH_TOKEN: undefined }), /juntos/);
  assert.throws(() => readConfig({ ...hosted, TURSO_DATABASE_URL: 'file:./data.db' }), /libsql/);
  assert.throws(
    () => readConfig({ ...hosted, TURSO_DATABASE_URL: 'https://name:secret@example.turso.io' }),
    /credenciais/,
  );
});

test('ambiente exposto exige senha e erros não contêm segredos', () => {
  for (const env of [
    { HOST: '0.0.0.0' },
    { NODE_ENV: 'production' },
    { ...hosted, ADMIN_PASSWORD: 'short-secret' },
    { ...hosted, ADMIN_PASSWORD: 'a'.repeat(201) },
  ]) {
    assert.throws(
      () => readConfig(env),
      (error) =>
        error.message.includes('ADMIN_PASSWORD') && !error.message.includes('short-secret'),
    );
  }
  assert.throws(() => readConfig({ PORT: 'invalid' }), /PORT/);
  assert.equal(readConfig({ ...hosted, SEED_DEMO: 'false' }).database.seed, false);
  assert.equal(readConfig({ ...hosted, DEMO_MODE: 'false' }).database.seed, false);
});
