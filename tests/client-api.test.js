import test from 'node:test';
import assert from 'node:assert/strict';
import { api, ApiError, sessionExpiredEvent } from '../src/lib/api.ts';

test('cliente retorna erro recuperável para falha de rede e preserva cancelamento solicitado', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => {
    throw new TypeError('Failed to fetch');
  });
  await assert.rejects(
    api('/auth/session', { method: 'POST', body: '{}' }),
    (error) => error instanceof ApiError && error.status === 0 && error.code === 'NETWORK_ERROR',
  );
  const controller = new AbortController();
  controller.abort();
  const cancelled = new Error('cancelled');
  t.mock.method(globalThis, 'fetch', async () => {
    throw cancelled;
  });
  await assert.rejects(
    api('/profile', { signal: controller.signal }),
    (error) => error === cancelled,
  );
});

test('perfil com sessão expirada dispara retorno ao login sem provocar repetição no carregamento inicial', async (t) => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const events = new EventTarget();
  Object.defineProperty(globalThis, 'window', { configurable: true, value: events });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'window', previous);
    else delete globalThis.window;
  });
  let expired = 0;
  events.addEventListener(sessionExpiredEvent, () => {
    expired += 1;
  });
  t.mock.method(
    globalThis,
    'fetch',
    async () =>
      new Response(JSON.stringify({ error: 'Entre na sua conta.', code: 'SESSION_REQUIRED' }), {
        status: 401,
      }),
  );
  await assert.rejects(api('/admin'), (error) => error.status === 401);
  assert.equal(expired, 0);
  await assert.rejects(api('/profile'), (error) => error.status === 401);
  assert.equal(expired, 1);
  await assert.rejects(
    api('/campaigns', { method: 'POST', body: '{}' }),
    (error) => error.status === 401,
  );
  assert.equal(expired, 2);
  t.mock.method(
    globalThis,
    'fetch',
    async () =>
      new Response(
        JSON.stringify({ error: 'Credenciais inválidas.', code: 'INVALID_CREDENTIALS' }),
        { status: 401 },
      ),
  );
  await assert.rejects(
    api('/auth/session', { method: 'POST', body: '{}' }),
    (error) => error.status === 401,
  );
  assert.equal(expired, 2);
});
