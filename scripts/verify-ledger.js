import { readFileSync } from 'node:fs';
import { verifyEntries, verifyPaymentReceipts } from '../server/ledger.js';

const path = process.argv[2];
if (!path) {
  console.error('Uso: node scripts/verify-ledger.js caminho-do-ledger.json');
  process.exit(1);
}

const snapshot = JSON.parse(readFileSync(path, 'utf8'));
const result = verifyEntries(snapshot.entries);
const anchors = (snapshot.anchors ?? []).map((anchor) => ({
  signature: anchor.signature,
  matchesHistory: verifyEntries(snapshot.entries.slice(0, anchor.count)).root === anchor.root,
}));
const cryptoReceiptsValid = verifyPaymentReceipts(snapshot.entries, snapshot.cryptoPayments);
console.log(JSON.stringify({ ...result, anchors, cryptoReceiptsValid }, null, 2));
process.exit(
  result.valid && cryptoReceiptsValid && anchors.every((anchor) => anchor.matchesHistory) ? 0 : 1,
);
