import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../server/store.js';

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'cripto-cow-store-'));
  const path = join(directory, 'store.sqlite');
  const clients = new Set();
  t.after(async () => {
    for (const store of clients) await store.close();
    for (const suffix of ['', '-wal', '-shm', '-journal']) {
      await rm(`${path}${suffix}`, { force: true });
    }
    await rmdir(directory);
  });
  return {
    open: async (seed = false) => {
      const store = await Store.open({ path, seed });
      clients.add(store);
      return store;
    },
    close: async (store) => {
      await store.close();
      clients.delete(store);
    },
  };
}

async function createCampaign(store, amount = 15000) {
  await store.save('campaigns', {
    id: 'cause',
    title: 'Campanha de teste',
    status: 'active',
    deadline: '2099-01-01',
    surplusRule: 'Devolução proporcional',
    budget: [
      { id: 'one', name: 'Materiais', planned: 10000 },
      { id: 'two', name: 'Transporte', planned: 10000 },
    ],
  });
  await store.append('cause', { type: 'campaign_created' });
  if (amount) await store.donate('cause', amount, randomUUID(), true);
}

function evidence(summary, amount = 5000, categoryId = 'one') {
  return {
    title: 'Compra demonstrativa',
    supplier: 'Fornecedor fictício',
    categoryId,
    amount,
    evidenceSummary: summary,
  };
}

test('arquivo preserva campanhas, movimentações e comprovantes após reabrir', async (t) => {
  const database = await fixture(t);
  const first = await database.open();
  await createCampaign(first);
  const expense = await first.requestExpense(
    'cause',
    evidence('Recibo fictício de materiais para verificar persistência.'),
  );
  await first.decideExpense(expense.id, true, 'Comprovante fictício revisado.');
  const snapshot = await first.campaign('cause');
  await database.close(first);

  const reopened = await database.open(true);
  assert.deepEqual(await reopened.campaign('cause'), snapshot);
  assert.equal((await reopened.list('campaigns')).length, 1);
  assert.equal((await reopened.list('donations', 'cause')).length, 1);
  assert.equal((await reopened.campaign('cause')).integrity.valid, true);
});

test('seed inicial não duplica campanhas ou ledger depois de reiniciar', async (t) => {
  const database = await fixture(t);
  const first = await database.open(true);
  const campaigns = await first.list('campaigns');
  assert.ok(campaigns.length > 0);
  const snapshot = await Promise.all(campaigns.map((campaign) => first.campaign(campaign.id)));
  await database.close(first);

  const reopened = await database.open(true);
  assert.deepEqual(await reopened.list('campaigns'), campaigns);
  assert.deepEqual(
    await Promise.all(campaigns.map((campaign) => reopened.campaign(campaign.id))),
    snapshot,
  );
});

test('falha ao gravar doação desfaz o ledger e permite a próxima operação', async (t) => {
  const database = await fixture(t);
  const store = await database.open();
  await createCampaign(store);
  const before = await store.campaign('cause');
  const key = randomUUID();
  await store.db.execute(`
    CREATE TRIGGER reject_donation BEFORE INSERT ON donations
    BEGIN SELECT RAISE(ABORT, 'Doação indisponível para teste'); END
  `);

  await assert.rejects(
    () => store.donate('cause', 1000, key, true),
    /Doação indisponível para teste/,
  );
  assert.deepEqual(await store.campaign('cause'), before);
  assert.equal((await store.list('donations', 'cause')).length, 1);

  await store.db.execute('DROP TRIGGER reject_donation');
  await store.donate('cause', 1000, key, true);
  const campaign = await store.campaign('cause');
  assert.equal(campaign.raised, 16000);
  assert.equal(campaign.integrity.valid, true);
});

test('transação externa desfaz doação e reserva realizadas por métodos assíncronos', async (t) => {
  const database = await fixture(t);
  const store = await database.open();
  await createCampaign(store);
  const before = await store.campaign('cause');

  await assert.rejects(
    () =>
      store.transaction(async () => {
        await store.donate('cause', 1000, randomUUID(), true);
        await store.requestExpense(
          'cause',
          evidence('Recibo fictício em transação que será desfeita.'),
        );
        throw new Error('Operação cancelada para teste');
      }),
    /Operação cancelada para teste/,
  );

  assert.deepEqual(await store.campaign('cause'), before);
  assert.equal((await store.list('donations', 'cause')).length, 1);
  await store.donate('cause', 1000, randomUUID(), true);
  assert.equal((await store.campaign('cause')).raised, 16000);
});

test('falha na liberação mantém reserva e saldo até uma aprovação completa', async (t) => {
  const database = await fixture(t);
  const store = await database.open();
  await createCampaign(store);
  const expense = await store.requestExpense(
    'cause',
    evidence('Recibo fictício para verificar rollback de aprovação.'),
  );
  const before = await store.campaign('cause');
  await store.db.execute(`
    CREATE TRIGGER reject_release BEFORE INSERT ON ledger
    WHEN json_extract(NEW.payload, '$.type') = 'release'
    BEGIN SELECT RAISE(ABORT, 'Liberação indisponível para teste'); END
  `);

  await assert.rejects(
    () => store.decideExpense(expense.id, true, 'Comprovante fictício revisado.'),
    /Liberação indisponível para teste/,
  );
  assert.deepEqual(await store.campaign('cause'), before);
  assert.equal((await store.get('expenses', expense.id)).status, 'pending');

  await store.db.execute('DROP TRIGGER reject_release');
  await store.decideExpense(expense.id, true, 'Comprovante fictício revisado.');
  const campaign = await store.campaign('cause');
  assert.equal(campaign.balance, 10000);
  assert.equal(campaign.pending, 0);
  assert.equal(campaign.integrity.valid, true);
});

test('duas conexões com a mesma chave de doação registram apenas uma entrada', async (t) => {
  const database = await fixture(t);
  const first = await database.open();
  await createCampaign(first);
  const second = await database.open();
  const key = randomUUID();
  const donations = await Promise.all([
    first.donate('cause', 1000, key, true),
    second.donate('cause', 1000, key, true),
  ]);

  assert.equal(donations[0].id, donations[1].id);
  const campaign = await first.campaign('cause');
  assert.equal(campaign.raised, 16000);
  assert.equal(campaign.ledger.filter((entry) => entry.referenceId === donations[0].id).length, 1);
  assert.equal((await second.list('donations', 'cause')).length, 2);
  assert.equal(campaign.integrity.valid, true);
});

test('pedidos concorrentes respeitam o orçamento da categoria', async (t) => {
  const database = await fixture(t);
  const first = await database.open();
  await createCampaign(first);
  const second = await database.open();
  const requests = await Promise.allSettled([
    first.requestExpense('cause', evidence('Primeiro recibo fictício de materiais.', 6000)),
    second.requestExpense('cause', evidence('Segundo recibo fictício de materiais.', 6000)),
  ]);

  assert.equal(requests.filter((request) => request.status === 'fulfilled').length, 1);
  assert.match(
    requests.find((request) => request.status === 'rejected').reason.message,
    /orçamento/,
  );
  const campaign = await second.campaign('cause');
  assert.equal(campaign.pending, 6000);
  assert.equal(campaign.expenses.length, 1);
  assert.equal(campaign.integrity.valid, true);
});

test('pedidos concorrentes em categorias distintas respeitam o saldo disponível', async (t) => {
  const database = await fixture(t);
  const first = await database.open();
  await createCampaign(first, 10000);
  const second = await database.open();
  const requests = await Promise.allSettled([
    first.requestExpense('cause', evidence('Recibo fictício de materiais.', 6000)),
    second.requestExpense('cause', evidence('Recibo fictício de transporte.', 6000, 'two')),
  ]);

  assert.equal(requests.filter((request) => request.status === 'fulfilled').length, 1);
  assert.match(requests.find((request) => request.status === 'rejected').reason.message, /saldo/);
  const campaign = await first.campaign('cause');
  assert.equal(campaign.balance - campaign.pending, 4000);
  assert.equal(campaign.expenses.length, 1);
  assert.equal(campaign.integrity.valid, true);
});

test('aprovações concorrentes do mesmo comprovante debitam o saldo uma vez', async (t) => {
  const database = await fixture(t);
  const first = await database.open();
  await createCampaign(first);
  const expense = await first.requestExpense(
    'cause',
    evidence('Recibo fictício para revisão concorrente.'),
  );
  const second = await database.open();
  const decisions = await Promise.allSettled([
    first.decideExpense(expense.id, true, 'Primeira revisão do comprovante.'),
    second.decideExpense(expense.id, true, 'Segunda revisão do comprovante.'),
  ]);

  assert.equal(decisions.filter((decision) => decision.status === 'fulfilled').length, 1);
  assert.equal(decisions.filter((decision) => decision.status === 'rejected').length, 1);
  const campaign = await second.campaign('cause');
  assert.equal(campaign.balance, 10000);
  assert.equal(campaign.released, 5000);
  assert.equal(campaign.pending, 0);
  assert.equal(campaign.ledger.filter((entry) => entry.type === 'release').length, 1);
  assert.equal(campaign.integrity.valid, true);
});

test('encerramento concorrente com doação preserva a regra de saldo zerado', async (t) => {
  const database = await fixture(t);
  const first = await database.open();
  await createCampaign(first, 0);
  const second = await database.open();
  const operations = await Promise.allSettled([
    first.donate('cause', 1000, randomUUID(), true),
    second.setStatus('cause', 'closed', 'Encerramento demonstrativo da campanha.'),
  ]);

  assert.equal(operations.filter((operation) => operation.status === 'fulfilled').length, 1);
  assert.equal(operations.filter((operation) => operation.status === 'rejected').length, 1);
  const campaign = await second.campaign('cause');
  assert.ok(
    (campaign.status === 'active' && campaign.balance === 1000) ||
      (campaign.status === 'closed' && campaign.balance === 0),
  );
  assert.equal(campaign.integrity.valid, true);
});

test('mudança de status desfaz a atualização se o registro no ledger falhar', async (t) => {
  const database = await fixture(t);
  const store = await database.open();
  await createCampaign(store);
  const before = await store.campaign('cause');
  await store.db.execute(`
    CREATE TRIGGER reject_status BEFORE INSERT ON ledger
    WHEN json_extract(NEW.payload, '$.type') = 'campaign_frozen'
    BEGIN SELECT RAISE(ABORT, 'Status indisponível para teste'); END
  `);

  await assert.rejects(
    () => store.setStatus('cause', 'frozen', 'Revisão demonstrativa da campanha.'),
    /Status indisponível para teste/,
  );
  assert.deepEqual(await store.campaign('cause'), before);
});
