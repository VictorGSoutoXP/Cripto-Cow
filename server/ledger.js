import { createHash, randomUUID } from 'node:crypto';

export const genesisHash = '0'.repeat(64);

export function canonical(value) {
  if (Array.isArray(value)) {
    return `[${value.map(canonical).join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export function digest(value) {
  return createHash('sha256')
    .update(typeof value === 'string' ? value : canonical(value))
    .digest('hex');
}

export function evidenceDigest(expense) {
  return digest({
    amount: expense.amount,
    categoryId: expense.categoryId,
    summary: expense.evidenceSummary,
    nonce: expense.evidenceNonce,
  });
}

export function makeEntry(previous, fields) {
  const payload = {
    id: randomUUID(),
    campaignId: fields.campaignId,
    sequence: (previous?.sequence ?? 0) + 1,
    type: fields.type,
    amount: fields.amount ?? 0,
    categoryId: fields.categoryId ?? null,
    evidenceLevel: fields.evidenceLevel ?? null,
    evidenceHash: fields.evidenceHash ?? null,
    referenceId: fields.referenceId ?? null,
    createdAt: fields.createdAt ?? new Date().toISOString(),
    previousHash: previous?.hash ?? genesisHash,
  };
  return { ...payload, hash: digest(payload) };
}

export function verifyEntries(entries) {
  let previousHash = genesisHash;
  let campaignId;
  for (let index = 0; index < entries.length; index += 1) {
    const { hash, ...payload } = entries[index];
    campaignId ??= payload.campaignId;
    if (
      payload.previousHash !== previousHash ||
      payload.sequence !== index + 1 ||
      payload.campaignId !== campaignId ||
      digest(payload) !== hash
    ) {
      return { valid: false, count: entries.length, brokenAt: index + 1, root: previousHash };
    }
    previousHash = hash;
  }
  return { valid: true, count: entries.length, root: previousHash };
}
