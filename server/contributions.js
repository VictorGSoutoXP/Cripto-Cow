import { unitsAmount } from './payments.js';

// The private association is separate from public receipts and ledger commitments.
// A single statement gives the summary and history the same database snapshot.
export async function profileContributions(store, userId, offset = 0) {
  const { rows } = await store.execute({
    sql: `SELECT o.kind, d.payload, c.payload AS campaign FROM contribution_owners o
      JOIN donations d ON o.reference_id = d.id JOIN campaigns c ON c.id = d.campaign_id
      WHERE o.user_id = ? AND o.kind = 'brl'
      UNION ALL
      SELECT o.kind, d.payload, c.payload FROM contribution_owners o
      JOIN demo_crypto_donations d ON o.reference_id = d.id JOIN campaigns c ON c.id = d.campaign_id
      WHERE o.user_id = ? AND o.kind = 'virtual'
      UNION ALL
      SELECT o.kind, d.payload, c.payload FROM contribution_owners o
      JOIN crypto_payments d ON o.reference_id = d.id JOIN campaigns c ON c.id = d.campaign_id
      WHERE o.user_id = ? AND o.kind = 'testnet'`,
    args: [userId, userId, userId],
  });
  const coinTotals = () => ({ solana: { units: '0', count: 0 }, zcash: { units: '0', count: 0 } });
  const totals = { brl: { cents: 0, count: 0 }, virtual: coinTotals(), testnet: coinTotals() };
  let pendingCount = 0;
  const history = rows
    .map((row) => {
      const receipt = JSON.parse(row.payload);
      const campaign = JSON.parse(row.campaign);
      const confirmed = row.kind !== 'testnet' || receipt.status === 'confirmed';
      if (row.kind === 'brl') {
        totals.brl.cents += receipt.amount;
        totals.brl.count++;
      } else if (confirmed) {
        const total = totals[row.kind][receipt.network];
        total.units = (BigInt(total.units) + BigInt(receipt.units)).toString();
        total.count++;
      } else pendingCount++;
      return {
        id: receipt.id,
        kind: row.kind,
        campaignId: campaign.id,
        campaignTitle: campaign.title,
        createdAt: receipt.acceptedAt ?? receipt.createdAt,
        confirmedAt: receipt.confirmedAt ?? null,
        status: row.kind === 'testnet' ? receipt.status : 'simulated',
        network: receipt.network ?? null,
        asset: row.kind === 'brl' ? 'BRL' : receipt.asset,
        amount: row.kind === 'brl' ? receipt.amount : unitsAmount(receipt.units, receipt.network),
        ledgerId: receipt.ledgerId ?? null,
        txid: receipt.txid ?? null,
      };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
  for (const kind of ['virtual', 'testnet'])
    for (const network of ['solana', 'zcash'])
      totals[kind][network].amount = unitsAmount(totals[kind][network].units, network);
  return {
    totals,
    pendingCount,
    total: history.length,
    offset,
    limit: 20,
    history: history.slice(offset, offset + 20),
  };
}
