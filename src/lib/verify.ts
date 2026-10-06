import type { LedgerEntry, Expense } from '../types';

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(object[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export async function verifyInBrowser(entries: LedgerEntry[]) {
  let previous = '0'.repeat(64);
  let campaignId: string | undefined;
  for (let index = 0; index < entries.length; index += 1) {
    const { hash, ...payload } = entries[index];
    campaignId ??= payload.campaignId;
    const buffer = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(canonical(payload)),
    );
    const actual = Array.from(new Uint8Array(buffer))
      .map((value) => value.toString(16).padStart(2, '0'))
      .join('');
    if (
      payload.sequence !== index + 1 ||
      payload.campaignId !== campaignId ||
      payload.previousHash !== previous ||
      actual !== hash
    )
      throw new Error(`Inconsistência encontrada no registro ${index + 1}.`);
    previous = hash;
  }
  return { root: previous, count: entries.length };
}

export async function verifyEvidence(expense: Expense) {
  const payload = {
    amount: expense.amount,
    categoryId: expense.categoryId,
    summary: expense.evidenceSummary,
    nonce: expense.evidenceNonce,
  };
  const buffer = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(canonical(payload)),
  );
  const actual = Array.from(new Uint8Array(buffer))
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
  return actual === expense.evidenceHash && actual === expense.recordedHash;
}
