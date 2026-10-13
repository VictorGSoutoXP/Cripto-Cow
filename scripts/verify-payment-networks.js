import { Connection } from '@solana/web3.js';
import { ZcashChain, transparentOutputs } from '../server/zcash-chain.js';
import { devnetGenesisHash } from '../server/solana.js';
import { createHash } from 'node:crypto';
import bs58 from 'bs58';

// Read-only smoke check. It never creates a donation, signs, sends or uses keys.
const solana = new Connection(process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com', {
  disableRetryOnRateLimit: true,
  fetch: (url, options) => fetch(url, { ...options, signal: AbortSignal.timeout(15000) }),
});
const zcash = new ZcashChain(process.env.ZCASH_LIGHTWALLETD);
try {
  if ((await solana.getGenesisHash()) !== devnetGenesisHash)
    throw new Error('Solana não é devnet.');
  console.log(
    JSON.stringify({ network: 'solana', chain: 'devnet', slot: await solana.getSlot('confirmed') }),
  );
  const height = await zcash.height();
  const block = await zcash.call('getBlock', { height: String(height) });
  const sample = block.vtx[0];
  if (!sample?.txid?.length) throw new Error('Bloco Zcash sem transação de exemplo.');
  const tx = await zcash.call('getTransaction', { hash: sample.txid });
  const outputs = transparentOutputs(tx.data);
  const matching = outputs.find((output) => /^76a914[a-f0-9]{40}88ac$/.test(output.script));
  if (matching) {
    const sha = (bytes) => createHash('sha256').update(bytes).digest();
    const addressBytes = Buffer.concat([
      Buffer.from([0x1d, 0x25]),
      Buffer.from(matching.script.slice(6, 46), 'hex'),
    ]);
    const receiver = bs58.encode(
      Buffer.concat([addressBytes, sha(sha(addressBytes)).subarray(0, 4)]),
    );
    await zcash.confirm(
      { receiver, units: matching.units, minHeight: height },
      Buffer.from(sample.txid).reverse().toString('hex'),
    );
  }
  const state = await zcash.call('getTreeState', { height: String(height) });
  if (state.network !== 'test' || Number(tx.height) !== height)
    throw new Error('Resposta Zcash não corresponde ao bloco da testnet.');
  console.log(
    JSON.stringify({
      network: 'zcash',
      chain: 'testnet',
      height,
      txid: Buffer.from(sample.txid).reverse().toString('hex'),
      transparentOutputs: outputs.length,
      blockHash: state.hash,
      existingTransparentOutputVerified: Boolean(matching),
    }),
  );
  console.log(
    'Consultas e decodificação reais aprovadas. Isso não é uma doação enviada pelo projeto.',
  );
} finally {
  zcash.close();
}
