import type { LedgerEntry, DemoCryptoDonation } from '../types';
import { canonical } from './verify';
export async function verifyDemoReceipts(
  entries: LedgerEntry[],
  receipts: DemoCryptoDonation[] = [],
) {
  const events = entries.filter((entry) => entry.type === 'demo_crypto_donation');
  if (events.length !== receipts.length)
    throw new Error('Há um recibo fictício ausente ou duplicado.');
  for (const entry of events) {
    const matches = receipts.filter((receipt) => receipt.id === entry.referenceId);
    if (matches.length !== 1) throw new Error('Recibo fictício inválido.');
    const receipt = matches[0];
    const expected = {
      id: receipt.id,
      campaignId: receipt.campaignId,
      network: receipt.network,
      units: receipt.units,
      simulated: true,
    };
    const buffer = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(canonical(expected)),
    );
    const hash = Array.from(new Uint8Array(buffer))
      .map((value) => value.toString(16).padStart(2, '0'))
      .join('');
    const precision = receipt.network === 'solana' ? 9 : 8;
    const units = receipt.units.padStart(precision + 1, '0');
    if (
      hash !== entry.evidenceHash ||
      receipt.status !== 'simulated' ||
      receipt.simulated !== true ||
      receipt.campaignId !== entry.campaignId ||
      receipt.amount !== `${units.slice(0, -precision)}.${units.slice(-precision)}`
    )
      throw new Error('O recibo fictício não corresponde ao histórico.');
  }
}
