import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../server/store.js';

test('URL Turso vazia usa o arquivo SQLite configurado e preserva os dados', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'cripto-cow-config-'));
  const path = join(directory, 'store.sqlite');
  const clients = [];
  t.after(async () => {
    for (const store of clients) await store.close();
    for (const suffix of ['', '-wal', '-shm', '-journal'])
      await rm(`${path}${suffix}`, { force: true });
    await rmdir(directory);
  });
  const store = await Store.open({ path, url: '', authToken: '' });
  clients.push(store);
  assert.equal(store.db.protocol, 'file');
  await store.save('campaigns', {
    id: 'cause',
    title: 'Campanha com banco local',
    status: 'active',
    deadline: '2099-01-01',
    surplusRule: 'Devolução proporcional',
    budget: [{ id: 'materials', name: 'Materiais', planned: 10000 }],
  });
  await store.append('cause', { type: 'campaign_created' });
  await store.donate('cause', 1000, randomUUID(), true);
  const before = await store.campaign('cause');
  await store.close();
  const reopened = await Store.open({ path, url: '   ', authToken: '' });
  clients.push(reopened);
  assert.equal(reopened.db.protocol, 'file');
  assert.deepEqual(await reopened.campaign('cause'), before);
  assert.equal((await reopened.list('campaigns')).length, 4);
});
