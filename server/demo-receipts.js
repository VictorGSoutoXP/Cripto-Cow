import { digest } from './ledger.js';
export function verifyDemoReceipts(entries, receipts = []) {
  const events = entries.filter((entry) => entry.type === 'demo_crypto_donation');
  return (
    events.length === receipts.length &&
    events.every((entry) => {
      const matches = receipts.filter((receipt) => receipt.id === entry.referenceId);
      if (matches.length !== 1) return false;
      const receipt = matches[0];
      const expected = {
        id: receipt.id,
        campaignId: receipt.campaignId,
        network: receipt.network,
        units: receipt.units,
        simulated: true,
      };
      const precision = { solana: 9, zcash: 8 }[receipt.network];
      if (!precision || !/^\d+$/.test(receipt.units)) return false;
      const units = receipt.units.padStart(precision + 1, '0');
      return (
        receipt.simulated === true &&
        receipt.status === 'simulated' &&
        receipt.campaignId === entry.campaignId &&
        !receipt.txid &&
        digest(expected) === entry.evidenceHash &&
        receipt.amount === `${units.slice(0, -precision)}.${units.slice(-precision)}`
      );
    })
  );
}
