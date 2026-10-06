import test from 'node:test';
import assert from 'node:assert/strict';
import { makeEntry, verifyEntries, canonical } from '../server/ledger.js';

test('hash canônico independe da ordem das propriedades', () => {
  assert.equal(
    canonical({ b: 2, a: { z: true, c: 1 } }),
    canonical({ a: { c: 1, z: true }, b: 2 }),
  );
});

test('alteração, exclusão, reordenação e troca de campanha invalidam o histórico', () => {
  const first = makeEntry(null, { campaignId: 'cause', type: 'donation', amount: 1000 });
  const second = makeEntry(first, { campaignId: 'cause', type: 'donation', amount: 2000 });
  const third = makeEntry(second, { campaignId: 'cause', type: 'release', amount: 500 });
  assert.equal(verifyEntries([first, second, third]).valid, true);
  assert.equal(verifyEntries([first, { ...second, amount: 3000 }, third]).valid, false);
  assert.equal(verifyEntries([first, third]).valid, false);
  assert.equal(verifyEntries([second, first, third]).valid, false);
  const foreign = makeEntry(first, { campaignId: 'another', type: 'donation', amount: 2000 });
  assert.equal(verifyEntries([first, foreign]).valid, false);
});

test('ledger aceita apenas campos financeiros opacos', () => {
  const entry = makeEntry(null, {
    campaignId: 'cause',
    type: 'donation',
    amount: 1000,
    donorName: 'Nome privado',
    healthData: 'Saúde',
    email: 'private@example.com',
  });
  assert.equal(JSON.stringify(entry).includes('privado'), false);
  assert.equal('donorName' in entry, false);
  assert.equal('healthData' in entry, false);
  assert.equal('email' in entry, false);
});
