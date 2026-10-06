import { randomUUID } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { campaigns } from './seed.js';
import { digest, evidenceDigest, makeEntry, verifyEntries } from './ledger.js';
import { openDatabase } from './database.js';

const tables = ['campaigns', 'expenses', 'reports', 'donations', 'anchors'];
const locks = new Map();
const schema = [
  'CREATE TABLE IF NOT EXISTS campaigns (id TEXT PRIMARY KEY, payload TEXT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS ledger (id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL REFERENCES campaigns(id), sequence INTEGER NOT NULL, payload TEXT NOT NULL, UNIQUE(campaign_id, sequence))',
  'CREATE TABLE IF NOT EXISTS expenses (id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL REFERENCES campaigns(id), payload TEXT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS reports (id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL REFERENCES campaigns(id), payload TEXT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS donations (id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL REFERENCES campaigns(id), request_key TEXT UNIQUE NOT NULL, payload TEXT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS anchors (id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL REFERENCES campaigns(id), payload TEXT NOT NULL)',
  "CREATE TRIGGER IF NOT EXISTS ledger_no_update BEFORE UPDATE ON ledger BEGIN SELECT RAISE(ABORT, 'Ledger is append-only'); END",
  "CREATE TRIGGER IF NOT EXISTS ledger_no_delete BEFORE DELETE ON ledger BEGIN SELECT RAISE(ABORT, 'Ledger is append-only'); END",
];

function saveStatement(table, value) {
  if (!tables.includes(table)) throw new Error('Tabela inválida.');
  if (table === 'campaigns') {
    return {
      sql: 'INSERT INTO campaigns VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET payload = excluded.payload',
      args: [value.id, JSON.stringify(value)],
    };
  }
  if (table === 'donations') {
    return {
      sql: 'INSERT INTO donations VALUES (?, ?, ?, ?)',
      args: [value.id, value.campaignId, value.requestKey, JSON.stringify(value)],
    };
  }
  return {
    sql: `INSERT INTO ${table} VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET payload = excluded.payload`,
    args: [value.id, value.campaignId, JSON.stringify(value)],
  };
}

function ledgerStatement(entry) {
  return {
    sql: 'INSERT INTO ledger VALUES (?, ?, ?, ?)',
    args: [entry.id, entry.campaignId, entry.sequence, JSON.stringify(entry)],
  };
}

export class Store {
  constructor(db, key) {
    this.db = db;
    this.context = new AsyncLocalStorage();
    this.closed = false;
    if (!locks.has(key)) locks.set(key, { tail: Promise.resolve(), users: 0 });
    this.lock = locks.get(key);
    this.lock.users += 1;
    this.key = key;
  }

  static async open({ path = './data/elo.sqlite', url, authToken, seed = true } = {}) {
    const { db, key } = openDatabase({ path, url, authToken });
    const store = new Store(db, key);
    try {
      await store.batch(schema);
      if (seed) await store.seed();
      return store;
    } catch (error) {
      await store.close();
      throw error;
    }
  }

  async exclusive(fn) {
    if (this.closed) throw new Error('O banco já foi encerrado.');
    const previous = this.lock.tail;
    let release;
    this.lock.tail = new Promise((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      if (this.closed) throw new Error('O banco já foi encerrado.');
      return await fn();
    } finally {
      release();
    }
  }

  executor() {
    const context = this.context.getStore();
    if (!context) return null;
    if (!context.active) throw new Error('A transação já foi encerrada.');
    return context.executor;
  }

  async execute(statement) {
    const executor = this.executor();
    return executor
      ? executor.execute(statement)
      : this.exclusive(() => this.db.execute(statement));
  }

  async batch(statements, mode = 'write') {
    const executor = this.executor();
    return executor
      ? executor.batch(statements)
      : this.exclusive(() => this.db.batch(statements, mode));
  }

  async transaction(fn) {
    if (this.executor()) {
      const context = this.context.getStore();
      try {
        return await fn();
      } catch (error) {
        context.error ??= error;
        throw error;
      }
    }
    return this.exclusive(async () => {
      const transaction = await this.db.transaction('write');
      const context = { executor: transaction, active: true };
      try {
        const result = await this.context.run(context, fn);
        if (context.error) throw context.error;
        await transaction.commit();
        return result;
      } catch (error) {
        await transaction.rollback().catch(() => {});
        throw error;
      } finally {
        context.active = false;
        transaction.close();
      }
    });
  }

  async close() {
    this.closePromise ??= this.exclusive(async () => {
      this.db.close();
      this.closed = true;
      this.context.disable();
      this.lock.users -= 1;
      if (this.lock.users === 0) locks.delete(this.key);
    });
    return this.closePromise;
  }

  async save(table, value) {
    await this.execute(saveStatement(table, value));
    return value;
  }

  async get(table, id) {
    if (!tables.includes(table)) throw new Error('Tabela inválida.');
    const { rows } = await this.execute({
      sql: `SELECT payload FROM ${table} WHERE id = ?`,
      args: [id],
    });
    return rows[0] ? JSON.parse(rows[0].payload) : null;
  }

  async list(table, campaignId) {
    if (!tables.includes(table)) throw new Error('Tabela inválida.');
    const statement = campaignId
      ? { sql: `SELECT payload FROM ${table} WHERE campaign_id = ?`, args: [campaignId] }
      : `SELECT payload FROM ${table}`;
    const { rows } = await this.execute(statement);
    return rows.map((row) => JSON.parse(row.payload));
  }

  async entries(campaignId) {
    const { rows } = await this.execute({
      sql: 'SELECT payload FROM ledger WHERE campaign_id = ? ORDER BY sequence',
      args: [campaignId],
    });
    return rows.map((row) => JSON.parse(row.payload));
  }

  async append(campaignId, fields) {
    return this.transaction(async () => {
      const { rows } = await this.execute({
        sql: 'SELECT payload FROM ledger WHERE campaign_id = ? ORDER BY sequence DESC LIMIT 1',
        args: [campaignId],
      });
      const entry = makeEntry(rows[0] ? JSON.parse(rows[0].payload) : null, {
        ...fields,
        campaignId,
      });
      await this.execute(ledgerStatement(entry));
      return entry;
    });
  }

  async campaign(id) {
    const [records, history, requests, anchors] = await this.batch(
      [
        { sql: 'SELECT payload FROM campaigns WHERE id = ?', args: [id] },
        {
          sql: 'SELECT payload FROM ledger WHERE campaign_id = ? ORDER BY sequence',
          args: [id],
        },
        { sql: 'SELECT payload FROM expenses WHERE campaign_id = ?', args: [id] },
        { sql: 'SELECT payload FROM anchors WHERE campaign_id = ?', args: [id] },
      ],
      'read',
    );
    if (!records.rows[0]) return null;
    const campaign = JSON.parse(records.rows[0].payload);
    const ledger = history.rows.map((row) => JSON.parse(row.payload));
    const expenses = requests.rows.map((row) => JSON.parse(row.payload));
    const incoming = ledger.filter((entry) => entry.type === 'donation');
    const outgoing = ledger.filter((entry) => entry.type === 'release');
    const raised = incoming.reduce((sum, entry) => sum + entry.amount, 0);
    const released = outgoing.reduce((sum, entry) => sum + entry.amount, 0);
    const pending = expenses
      .filter((expense) => expense.status === 'pending')
      .reduce((sum, expense) => sum + expense.amount, 0);
    return {
      ...campaign,
      raised,
      released,
      balance: raised - released,
      pending,
      donors: incoming.length,
      budget: campaign.budget.map((category) => ({
        ...category,
        spent: outgoing
          .filter((entry) => entry.categoryId === category.id)
          .reduce((sum, entry) => sum + entry.amount, 0),
      })),
      expenses: expenses.map((expense) => ({
        ...expense,
        recordedHash:
          ledger.filter((entry) => entry.referenceId === expense.id && entry.evidenceHash).at(-1)
            ?.evidenceHash ?? null,
      })),
      ledger,
      integrity: verifyEntries(ledger),
      anchors: anchors.rows
        .map((row) => JSON.parse(row.payload))
        .filter((anchor) => anchor.status === 'confirmed'),
    };
  }

  async donate(campaignId, amount, requestKey, accepted) {
    return this.transaction(async () => {
      const { rows } = await this.execute({
        sql: 'SELECT payload FROM donations WHERE request_key = ?',
        args: [requestKey],
      });
      if (rows[0]) {
        const donation = JSON.parse(rows[0].payload);
        if (donation.campaignId !== campaignId || donation.amount !== amount)
          throw new Error('Identificador de doação já utilizado.');
        return donation;
      }
      const campaign = await this.campaign(campaignId);
      if (!campaign || campaign.status !== 'active')
        throw new Error('Esta campanha não está recebendo doações.');
      if (new Date(`${campaign.deadline}T23:59:59-03:00`) < new Date())
        throw new Error('O prazo da campanha terminou.');
      if (!accepted) throw new Error('Aceite as regras da campanha para continuar.');
      if (!Number.isSafeInteger(amount) || amount < 100 || amount > 1000000)
        throw new Error('A doação deve ser entre R$ 1 e R$ 10.000.');
      const id = randomUUID();
      const entry = await this.append(campaignId, { type: 'donation', amount, referenceId: id });
      return this.save('donations', {
        id,
        campaignId,
        amount,
        requestKey,
        termsVersion: 'demo-1.0',
        surplusRule: campaign.surplusRule,
        acceptedAt: entry.createdAt,
        ledgerId: entry.id,
        simulated: true,
      });
    });
  }

  async requestExpense(campaignId, input) {
    return this.transaction(async () => {
      const campaign = await this.campaign(campaignId);
      if (!campaign || campaign.status !== 'active')
        throw new Error('A campanha deve estar ativa para solicitar uma liberação.');
      const category = campaign.budget.find((item) => item.id === input.categoryId);
      if (!category) throw new Error('Categoria não encontrada.');
      if (!Number.isSafeInteger(input.amount) || input.amount < 100)
        throw new Error('Informe um valor válido.');
      const reserved = campaign.expenses
        .filter((item) => item.status === 'pending' && item.categoryId === category.id)
        .reduce((sum, item) => sum + item.amount, 0);
      if (input.amount > campaign.balance - campaign.pending)
        throw new Error('O saldo disponível não cobre esta solicitação.');
      if (input.amount > category.planned - category.spent - reserved)
        throw new Error('O valor ultrapassa o orçamento disponível nesta categoria.');
      const evidenceNonce = randomUUID();
      const evidenceHash = evidenceDigest({ ...input, evidenceNonce });
      if (
        campaign.expenses.some(
          (item) => item.evidenceSummary === input.evidenceSummary && item.status !== 'rejected',
        )
      )
        throw new Error('Este comprovante já foi enviado para esta campanha.');
      const expense = await this.save('expenses', {
        ...input,
        evidenceLevel: 'C',
        id: randomUUID(),
        campaignId,
        evidenceHash,
        evidenceNonce,
        status: 'pending',
        createdAt: new Date().toISOString(),
        simulated: true,
      });
      await this.append(campaignId, {
        type: 'expense_requested',
        referenceId: expense.id,
        categoryId: expense.categoryId,
        evidenceHash,
        evidenceLevel: 'C',
      });
      return expense;
    });
  }

  async decideExpense(id, approved, reason) {
    return this.transaction(async () => {
      const expense = await this.get('expenses', id);
      if (!expense || expense.status !== 'pending')
        throw new Error('Esta solicitação já foi analisada ou não existe.');
      const campaign = await this.campaign(expense.campaignId);
      if (campaign.status !== 'active')
        throw new Error('Liberações estão suspensas nesta campanha.');
      const category = campaign.budget.find((item) => item.id === expense.categoryId);
      if (
        approved &&
        (expense.amount > campaign.balance || expense.amount + category.spent > category.planned)
      )
        throw new Error('Saldo ou orçamento insuficiente para esta liberação.');
      const updated = await this.save('expenses', {
        ...expense,
        status: approved ? 'approved' : 'rejected',
        reason,
        decidedAt: new Date().toISOString(),
      });
      await this.append(expense.campaignId, {
        type: approved ? 'release' : 'expense_rejected',
        amount: approved ? expense.amount : 0,
        categoryId: expense.categoryId,
        evidenceLevel: expense.evidenceLevel,
        evidenceHash: expense.evidenceHash,
        referenceId: expense.id,
      });
      return updated;
    });
  }

  async setStatus(id, status, reason) {
    return this.transaction(async () => {
      if (!['active', 'frozen', 'closed'].includes(status)) throw new Error('Status inválido.');
      const campaign = await this.get('campaigns', id);
      if (!campaign) throw Object.assign(new Error('Campanha não encontrada.'), { status: 404 });
      if (campaign.status === 'closed')
        throw new Error('Uma campanha encerrada não pode ser reaberta.');
      if (campaign.status === 'draft' && status !== 'active')
        throw new Error('Publique a campanha antes de alterar seu status.');
      if (campaign.status === status) throw new Error('A campanha já está neste status.');
      const financial = await this.campaign(id);
      if (status === 'closed' && (financial.balance > 0 || financial.pending > 0))
        throw new Error(
          'O encerramento exige saldo zerado e nenhuma liberação pendente. Devoluções ainda dependem da integração com pagamentos.',
        );
      await this.save('campaigns', {
        ...campaign,
        status,
        statusReason: reason,
        updatedAt: new Date().toISOString(),
      });
      await this.append(id, {
        type: `campaign_${status}`,
        evidenceHash: digest({ reason, nonce: randomUUID() }),
      });
      return this.campaign(id);
    });
  }

  async seed() {
    return this.transaction(async () => {
      const existing = await this.execute('SELECT id FROM campaigns LIMIT 1');
      if (existing.rows.length) return;
      const statements = [];
      for (const item of campaigns) {
        const { raised, donors, expenses, ...campaign } = item;
        statements.push(
          saveStatement('campaigns', {
            ...campaign,
            createdAt: '2026-09-29T10:00:00.000Z',
            simulated: true,
          }),
        );
        let previous = null;
        const append = (fields) => {
          previous = makeEntry(previous, { ...fields, campaignId: campaign.id });
          statements.push(ledgerStatement(previous));
        };
        append({ type: 'campaign_created', createdAt: '2026-09-29T10:00:00.000Z' });
        const portion = Math.floor(raised / donors);
        for (let index = 0; index < donors; index += 1) {
          append({
            type: 'donation',
            amount: index === donors - 1 ? raised - portion * index : portion,
            referenceId: randomUUID(),
            createdAt: new Date(Date.UTC(2026, 8, 30, 10, index * 13)).toISOString(),
          });
        }
        for (const expense of expenses) {
          const evidenceNonce = randomUUID();
          const evidenceHash = evidenceDigest({ ...expense, evidenceNonce });
          const record = {
            ...expense,
            id: randomUUID(),
            campaignId: campaign.id,
            evidenceHash,
            evidenceNonce,
            status: 'approved',
            simulated: true,
            reason: 'Exemplo aprovado para demonstração. Sem validação fiscal ou pagamento real.',
            decidedAt: expense.createdAt,
          };
          statements.push(saveStatement('expenses', record));
          append({
            type: 'release',
            amount: expense.amount,
            categoryId: expense.categoryId,
            evidenceLevel: expense.evidenceLevel,
            evidenceHash,
            referenceId: record.id,
            createdAt: expense.createdAt,
          });
        }
      }
      await this.batch(statements);
    });
  }
}
