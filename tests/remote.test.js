import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdtemp, rm, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../server/store.js';

function decodeValue(value) {
  if (value.type === 'null') return null;
  if (value.type === 'integer') return Number(value.value);
  if (value.type === 'blob') return Buffer.from(value.base64, 'base64');
  return value.value;
}

function encodeValue(value) {
  if (value === null) return { type: 'null' };
  if (typeof value === 'string') return { type: 'text', value };
  if (value instanceof Uint8Array)
    return { type: 'blob', base64: Buffer.from(value).toString('base64') };
  if (Number.isInteger(value)) return { type: 'integer', value: String(value) };
  return { type: 'float', value };
}

function conditionMatches(condition, results, errors) {
  if (!condition) return true;
  if (condition.type === 'ok') return results[condition.step] !== null;
  if (condition.type === 'error') return errors[condition.step] !== null;
  if (condition.type === 'not') return !conditionMatches(condition.cond, results, errors);
  if (condition.type === 'and')
    return condition.conds.every((item) => conditionMatches(item, results, errors));
  if (condition.type === 'or')
    return condition.conds.some((item) => conditionMatches(item, results, errors));
  throw new Error('Condição Hrana não suportada pelo teste.');
}

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'cripto-cow-remote-'));
  const path = join(directory, 'remote.sqlite');
  const sessions = new Map();
  const stores = new Set();
  const stats = { requests: 0, maxBatch: 0, sql: [], authorization: new Set() };
  const execute = (session, input) => {
    const original = input.sql ?? session.sql.get(input.sql_id);
    stats.sql.push(original);
    const sql = original === 'BEGIN TRANSACTION READONLY' ? 'BEGIN' : original;
    const statement = session.db.prepare(sql);
    const columns = statement.columns();
    const args = input.named_args?.length
      ? [Object.fromEntries(input.named_args.map((item) => [item.name, decodeValue(item.value)]))]
      : (input.args ?? []).map(decodeValue);
    if (columns.length) {
      const rows = statement.all(...args);
      return {
        cols: columns.map((column) => ({ name: column.name, decltype: column.type })),
        rows: input.want_rows
          ? rows.map((row) => columns.map((column) => encodeValue(row[column.name])))
          : [],
        affected_row_count: 0,
        last_insert_rowid: null,
      };
    }
    const result = statement.run(...args);
    return {
      cols: [],
      rows: [],
      affected_row_count: Number(result.changes),
      last_insert_rowid: String(result.lastInsertRowid),
    };
  };
  const batch = (session, input) => {
    const results = [];
    const errors = [];
    stats.maxBatch = Math.max(stats.maxBatch, input.steps.length);
    for (const step of input.steps) {
      let result = null;
      let error = null;
      if (conditionMatches(step.condition, results, errors)) {
        try {
          result = execute(session, step.stmt);
        } catch (failure) {
          error = { message: failure.message, code: 'SQLITE_ERROR' };
        }
      }
      results.push(result);
      errors.push(error);
    }
    return { step_results: results, step_errors: errors };
  };
  const server = createServer(async (req, res) => {
    if (req.method !== 'POST' || req.url !== '/v2/pipeline') {
      res.writeHead(404).end();
      return;
    }
    try {
      stats.requests += 1;
      stats.authorization.add(req.headers.authorization);
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const input = JSON.parse(Buffer.concat(chunks).toString());
      const baton = input.baton ?? randomUUID();
      if (!sessions.has(baton)) {
        const db = new DatabaseSync(path);
        db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
        sessions.set(baton, { db, sql: new Map() });
      }
      const session = sessions.get(baton);
      const results = input.requests.map((request) => {
        try {
          const response = { type: request.type };
          if (request.type === 'execute') response.result = execute(session, request.stmt);
          else if (request.type === 'batch') response.result = batch(session, request.batch);
          else if (request.type === 'store_sql') session.sql.set(request.sql_id, request.sql);
          else if (request.type === 'close_sql') session.sql.delete(request.sql_id);
          else if (request.type === 'close') {
            session.db.close();
            sessions.delete(baton);
          } else throw new Error('Operação Hrana não suportada pelo teste.');
          return { type: 'ok', response };
        } catch (error) {
          return { type: 'error', error: { message: error.message, code: 'SQLITE_ERROR' } };
        }
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ baton: sessions.has(baton) ? baton : null, results }));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: error.message }));
    }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    for (const store of stores) await store.close();
    await new Promise((resolve) => server.close(resolve));
    for (const session of sessions.values()) session.db.close();
    for (const suffix of ['', '-wal', '-shm', '-journal'])
      await rm(`${path}${suffix}`, { force: true });
    await rmdir(directory);
  });
  return {
    stats,
    open: async (seed = false) => {
      const store = await Store.open({
        url: `http://127.0.0.1:${server.address().port}`,
        authToken: 'token-ficticio',
        seed,
      });
      stores.add(store);
      assert.equal(store.db.protocol, 'http');
      return store;
    },
  };
}

async function createCampaign(store) {
  const campaign = {
    id: "causa-' OR 1 = 1 --",
    title: 'Campanha remota com acentuação e parâmetros',
    status: 'active',
    deadline: '2099-01-01',
    surplusRule: 'Devolução proporcional',
    budget: [{ id: 'materials', name: 'Materiais', planned: 10000 }],
  };
  await store.transaction(async () => {
    await store.save('campaigns', campaign);
    await store.append(campaign.id, { type: 'campaign_created' });
  });
  return campaign.id;
}

test('cliente libSQL HTTP registra, consulta e reabre o banco sem conexão à nuvem', async (t) => {
  const remote = await fixture(t);
  const store = await remote.open(true);
  assert.ok(remote.stats.requests < 10);
  assert.ok(remote.stats.maxBatch > 300);
  assert.equal((await store.list('campaigns')).length, 3);
  const seeded = await store.campaign('horta-do-amanha');
  assert.equal(seeded.integrity.valid, true);
  assert.equal(seeded.raised, 2845000);
  assert.ok(remote.stats.sql.includes('BEGIN TRANSACTION READONLY'));
  const id = await createCampaign(store);
  const key = randomUUID();
  const first = await store.donate(id, 5000, key, true);
  const second = await store.donate(id, 5000, key, true);
  assert.equal(first.id, second.id);
  assert.equal((await store.campaign(id)).raised, 5000);
  assert.equal((await store.campaign(id)).integrity.valid, true);
  const before = await store.campaign(id);
  await assert.rejects(
    store.transaction(async () => {
      await store.donate(id, 1000, randomUUID(), true);
      throw new Error('Falha após registrar doação.');
    }),
    /Falha após registrar doação/,
  );
  assert.deepEqual(await store.campaign(id), before);
  await store.close();
  const reopened = await remote.open(true);
  assert.deepEqual(await reopened.campaign(id), before);
  assert.deepEqual(await reopened.campaign('horta-do-amanha'), seeded);
  assert.equal((await reopened.list('campaigns')).length, 4);
  assert.deepEqual([...remote.stats.authorization], ['Bearer token-ficticio']);
});

test('falha financeira aninhada impede commit mesmo quando o callback captura o erro', async (t) => {
  const remote = await fixture(t);
  const store = await remote.open();
  const id = await createCampaign(store);
  const before = await store.campaign(id);
  await store.db.execute(`
    CREATE TRIGGER reject_remote_donation BEFORE INSERT ON donations
    BEGIN SELECT RAISE(ABORT, 'Doação indisponível para teste remoto'); END
  `);
  await assert.rejects(
    store.transaction(async () => {
      await assert.rejects(store.donate(id, 1000, randomUUID(), true), /Doação indisponível/);
      await store.save('campaigns', { ...(await store.get('campaigns', id)), status: 'frozen' });
    }),
    /Doação indisponível/,
  );
  assert.deepEqual(await store.campaign(id), before);
  await store.db.execute('DROP TRIGGER reject_remote_donation');
  await store.donate(id, 1000, randomUUID(), true);
  assert.equal((await store.campaign(id)).raised, 1000);
});
