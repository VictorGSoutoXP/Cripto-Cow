import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Store } from '../server/store.js';
import { evidenceDigest } from '../server/ledger.js';
import { getAcceptance } from '../server/legal.js';

async function fixture(t) {
  const store = await Store.open({ path: ':memory:', seed: false });
  t.after(() => store.close());
  await store.save('campaigns', {
    id: 'cause',
    title: 'Teste',
    status: 'active',
    deadline: '2099-01-01',
    surplusRule: 'Devolução proporcional',
    releaseRule: 'Liberação por etapa após análise',
    budget: [
      { id: 'one', name: 'Categoria', planned: 10000 },
      { id: 'two', name: 'Outra', planned: 10000 },
    ],
  });
  await store.append('cause', { type: 'campaign_created' });
  await store.donate('cause', 15000, randomUUID(), true);
  return store;
}

const evidence = {
  title: 'Compra demonstrativa',
  supplier: 'Fornecedor fictício',
  categoryId: 'one',
  amount: 5000,
  evidenceSummary: 'Recibo fictício para demonstrar a prestação de contas sem dados pessoais.',
};

test('doação é idempotente e preserva o aceite da regra da sobra', async (t) => {
  const store = await fixture(t);
  const key = randomUUID();
  const first = await store.donate('cause', 1000, key, true);
  const second = await store.donate('cause', 1000, key, true);
  assert.equal(first.id, second.id);
  assert.equal((await store.campaign('cause')).raised, 16000);
  const acceptance = getAcceptance('donor');
  assert.equal(first.termsVersion, acceptance.version);
  assert.equal(first.termsHash, acceptance.hash);
  assert.deepEqual(first.termsDocumentIds, acceptance.documents);
  assert.equal(first.termsText, acceptance.text);
  assert.equal(first.surplusRule, 'Devolução proporcional');
  assert.equal(first.releaseRule, 'Liberação por etapa após análise');
  assert.equal(first.simulated, true);
  assert.deepEqual(await store.get('donations', first.id), first);
  await store.save('campaigns', {
    ...(await store.get('campaigns', 'cause')),
    surplusRule: 'Outra regra de sobra',
    releaseRule: 'Outra regra de liberação',
  });
  assert.deepEqual(await store.donate('cause', 1000, key, true), first);
  await assert.rejects(() => store.donate('cause', 2000, key, true));
  await assert.rejects(() => store.donate('cause', 1000, randomUUID(), false));
  await assert.rejects(() => store.donate('cause', 100.5, randomUUID(), true));
});

test('solicitação reserva saldo, aprovação debita uma única vez e mantém integridade', async (t) => {
  const store = await fixture(t);
  const expense = await store.requestExpense('cause', evidence);
  assert.equal(evidenceDigest(expense), expense.evidenceHash);
  assert.notEqual(
    evidenceDigest({ ...expense, evidenceSummary: 'Conteúdo alterado.' }),
    expense.evidenceHash,
  );
  const pending = await store.campaign('cause');
  assert.equal(pending.expenses[0].recordedHash, expense.evidenceHash);
  assert.equal(pending.balance, 15000);
  assert.equal(pending.pending, 5000);
  await store.decideExpense(expense.id, true, 'Recibo fictício revisado para demonstração.');
  const approved = await store.campaign('cause');
  assert.equal(approved.balance, 10000);
  assert.equal(approved.budget[0].spent, 5000);
  assert.equal(approved.pending, 0);
  assert.equal(approved.integrity.valid, true);
  await assert.rejects(() => store.decideExpense(expense.id, true, 'Duplicidade'));
});

test('orçamento e saldo incluem reservas pendentes', async (t) => {
  const store = await fixture(t);
  await store.requestExpense('cause', { ...evidence, amount: 9000 });
  await assert.rejects(
    () =>
      store.requestExpense('cause', {
        ...evidence,
        evidenceSummary: 'Outra evidência fictícia para teste de orçamento.',
        amount: 2000,
      }),
    /orçamento/,
  );
  await assert.rejects(
    () =>
      store.requestExpense('cause', {
        ...evidence,
        categoryId: 'two',
        evidenceSummary: 'Outra evidência fictícia para teste de saldo.',
        amount: 7000,
      }),
    /saldo/,
  );
  const campaign = await store.campaign('cause');
  assert.equal(campaign.pending, 9000);
  assert.equal(campaign.expenses.length, 1);
});

test('recusa libera reserva sem registrar gasto', async (t) => {
  const store = await fixture(t);
  const expense = await store.requestExpense('cause', evidence);
  await store.decideExpense(expense.id, false, 'Evidência insuficiente para aprovação.');
  const campaign = await store.campaign('cause');
  assert.equal(campaign.balance, 15000);
  assert.equal(campaign.pending, 0);
  assert.equal(campaign.released, 0);
});

test('campanha suspensa bloqueia doações, novos pedidos e aprovação pendente', async (t) => {
  const store = await fixture(t);
  const expense = await store.requestExpense('cause', evidence);
  await store.setStatus('cause', 'frozen', 'Revisão da campanha.');
  await assert.rejects(() => store.donate('cause', 1000, randomUUID(), true));
  await assert.rejects(() => store.requestExpense('cause', evidence));
  await assert.rejects(() => store.decideExpense(expense.id, true, 'Analisado'));
  assert.equal((await store.campaign('cause')).balance, 15000);
});

test('banco rejeita atualização e exclusão do ledger', async (t) => {
  const store = await fixture(t);
  await assert.rejects(
    () => store.db.execute({ sql: 'UPDATE ledger SET payload = ?', args: ['{}'] }),
    /append-only/,
  );
  await assert.rejects(() => store.db.execute('DELETE FROM ledger'), /append-only/);
});
