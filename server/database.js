import { createClient } from '@libsql/client/web';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

class LocalDatabase {
  constructor(path) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.database = new DatabaseSync(path);
    this.database.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000;');
    if (path !== ':memory:') this.database.exec('PRAGMA journal_mode = WAL;');
    this.closed = false;
    this.protocol = 'file';
  }

  async execute(input, args = []) {
    const sql = typeof input === 'string' ? input : input.sql;
    const values = typeof input === 'string' ? args : (input.args ?? []);
    const statement = this.database.prepare(sql);
    const columns = statement.columns();
    const parameters = Array.isArray(values) ? values : [values];
    if (columns.length) {
      return {
        rows: statement.all(...parameters),
        columns: columns.map((column) => column.name),
        columnTypes: columns.map((column) => column.type ?? ''),
        rowsAffected: 0,
      };
    }
    const result = statement.run(...parameters);
    return {
      rows: [],
      columns: [],
      columnTypes: [],
      rowsAffected: Number(result.changes),
      lastInsertRowid: BigInt(result.lastInsertRowid),
    };
  }

  async batch(statements, mode = 'write') {
    const transaction = await this.transaction(mode);
    try {
      const results = await transaction.batch(statements);
      await transaction.commit();
      return results;
    } catch (error) {
      await transaction.rollback();
      throw error;
    } finally {
      transaction.close();
    }
  }

  async transaction(mode = 'write') {
    this.database.exec(mode === 'write' ? 'BEGIN IMMEDIATE' : 'BEGIN');
    const client = this;
    let closed = false;
    return {
      get closed() {
        return closed;
      },
      async execute(input, args) {
        if (closed) throw new Error('A transação já foi encerrada.');
        return client.execute(input, args);
      },
      async batch(statements) {
        const results = [];
        for (const statement of statements) results.push(await this.execute(statement));
        return results;
      },
      async commit() {
        if (closed) throw new Error('A transação já foi encerrada.');
        client.database.exec('COMMIT');
        closed = true;
      },
      async rollback() {
        if (closed) return;
        client.database.exec('ROLLBACK');
        closed = true;
      },
      close() {
        if (closed) return;
        client.database.exec('ROLLBACK');
        closed = true;
      },
    };
  }

  close() {
    if (this.closed) return;
    this.database.close();
    this.closed = true;
  }
}

export function openDatabase({ path, url, authToken }) {
  const databaseUrl = url?.trim() || undefined;
  if (databaseUrl && !databaseUrl.startsWith('file:') && databaseUrl !== ':memory:') {
    return {
      db: createClient({ url: databaseUrl, authToken }),
      key: databaseUrl,
    };
  }
  const filename = databaseUrl?.startsWith('file://')
    ? fileURLToPath(databaseUrl)
    : databaseUrl?.startsWith('file:')
      ? decodeURIComponent(databaseUrl.slice(5))
      : (databaseUrl ?? path);
  const localPath = filename === ':memory:' ? filename : resolve(filename);
  return {
    db: new LocalDatabase(localPath),
    key:
      localPath === ':memory:'
        ? Symbol('memory')
        : process.platform === 'win32'
          ? localPath.toLowerCase()
          : localPath,
  };
}
