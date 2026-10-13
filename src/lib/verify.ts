import type { LedgerEntry, Expense, CryptoPayment } from '../types';

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

export async function verifyPaymentReceipts(
  entries: LedgerEntry[],
  receipts: CryptoPayment[] = [],
) {
  const events = entries.filter((entry) => entry.type === 'crypto_donation');
  if (events.length !== receipts.length)
    throw new Error('Há um recibo cripto ausente ou duplicado.');
  for (const entry of events) {
    const matches = receipts.filter((receipt) => receipt.id === entry.referenceId);
    const receipt = matches[0];
    if (matches.length !== 1 || !receipt.commitment) throw new Error('Recibo cripto inválido.');
    const buffer = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(canonical(receipt.commitment)),
    );
    const hash = Array.from(new Uint8Array(buffer))
      .map((value) => value.toString(16).padStart(2, '0'))
      .join('');
    const precision = receipt.network === 'solana' ? 9 : 8;
    const units = receipt.units.padStart(precision + 1, '0');
    if (
      hash !== entry.evidenceHash ||
      receipt.campaignId !== entry.campaignId ||
      receipt.status !== 'confirmed' ||
      receipt.amount !== `${units.slice(0, -precision)}.${units.slice(-precision)}` ||
      ['id', 'campaignId', 'network', 'receiver', 'units', 'txid'].some(
        (field) => receipt.commitment![field] !== receipt[field as keyof CryptoPayment],
      ) ||
      Object.keys(receipt.commitment).some(
        (field) => receipt.commitment![field] !== receipt[field as keyof CryptoPayment],
      )
    )
      throw new Error('O recibo cripto não corresponde ao registro verificável.');
  }
}
