import { cents } from './api.ts';

export function estimateCrypto(amount: string, network: 'solana' | 'zcash', rateCents?: number) {
  try {
    const value = cents(amount);
    if (!Number.isSafeInteger(value) || value < 100 || value > 1000000 || !rateCents) return '';
    const precision = network === 'solana' ? 9 : 8;
    const units = (BigInt(value) * 10n ** BigInt(precision)) / BigInt(rateCents);
    if (units === 0n) return '';
    const text = units.toString().padStart(precision + 1, '0');
    return `${text.slice(0, -precision)}.${text.slice(-precision)}`;
  } catch {
    return '';
  }
}
