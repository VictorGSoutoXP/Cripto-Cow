import grpc from '@grpc/grpc-js';
import protoLoader from '@grpc/proto-loader';
import bs58 from 'bs58';
import { fileURLToPath } from 'node:url';
import { validateZcashAddress } from './zcash.js';

const definition = protoLoader.loadSync(
  fileURLToPath(new URL('./lightwallet.proto', import.meta.url)),
  {
    longs: String,
    defaults: true,
  },
);
const { CompactTxStreamer } = grpc.loadPackageDefinition(definition).cash.z.wallet.sdk.rpc;
export const zcashTestnetEndpoint = 'testnet.zec.rocks:443';

const error = (message, code, status = 400) => Object.assign(new Error(message), { code, status });

// Decode only transparent outputs; shielded bundles remain with the trusted node.
// V4: Zcash protocol §7.1; V5: ZIP 225; V6: ZIP 229. Unknown versions fail closed.
export function transparentOutputs(data) {
  const bytes = Buffer.from(data);
  let offset = 0;
  function take(size) {
    if (!Number.isSafeInteger(size) || size < 0 || offset + size > bytes.length)
      throw error('Transação Zcash truncada.', 'INVALID_TRANSACTION');
    const value = bytes.subarray(offset, offset + size);
    offset += size;
    return value;
  }
  function count() {
    const marker = take(1)[0];
    const value =
      marker < 253
        ? marker
        : marker === 253
          ? take(2).readUInt16LE()
          : marker === 254
            ? take(4).readUInt32LE()
            : Number(take(8).readBigUInt64LE());
    if (
      !Number.isSafeInteger(value) ||
      value > 2000000 ||
      (marker === 253 && value < 253) ||
      (marker === 254 && value <= 65535) ||
      (marker === 255 && value <= 4294967295)
    )
      throw error('Tamanho inválido na transação Zcash.', 'INVALID_TRANSACTION');
    return value;
  }
  const header = take(4).readUInt32LE();
  const version = header & 0x7fffffff;
  if (!(header & 0x80000000) || ![4, 5, 6].includes(version))
    throw error(
      'Formato Zcash não suportado. Use uma carteira com transações V4, V5 ou V6.',
      'INVALID_TRANSACTION',
    );
  const group = take(4).readUInt32LE();
  if (group !== { 4: 0x892f2085, 5: 0x26a7270a, 6: 0xd884b698 }[version])
    throw error('Grupo de versão Zcash inválido.', 'INVALID_TRANSACTION');
  if (version >= 5) take(12);
  const inputs = count();
  for (let i = 0; i < inputs; i++) {
    take(36);
    take(count());
    take(4);
  }
  const outputs = [];
  const length = count();
  for (let i = 0; i < length; i++) {
    const units = take(8).readBigInt64LE();
    if (units < 0n || units > 2100000000000000n)
      throw error('Valor Zcash inválido.', 'INVALID_TRANSACTION');
    outputs.push({ index: i, units: units.toString(), script: take(count()).toString('hex') });
  }
  return outputs;
}

export function zcashReceiverScript(address) {
  validateZcashAddress(address);
  return `76a914${Buffer.from(bs58.decode(address)).subarray(2, 22).toString('hex')}88ac`;
}

export class ZcashChain {
  constructor(endpoint = zcashTestnetEndpoint) {
    if (!/^[a-zA-Z0-9.-]+:\d+$/.test(endpoint))
      throw new Error('ZCASH_LIGHTWALLETD deve usar host:porta.');
    this.client = new CompactTxStreamer(endpoint, grpc.credentials.createSsl(), {
      'grpc.max_receive_message_length': 2100000,
    });
  }
  call(method, input) {
    return new Promise((resolve, reject) =>
      this.client[method](input, { deadline: Date.now() + 15000 }, (err, result) => {
        if (err?.code === grpc.status.NOT_FOUND && method === 'getTransaction')
          reject(
            error(
              'Transação ainda não encontrada na Zcash testnet. Confira o TXID e aguarde.',
              'CONFIRMATION_PENDING',
              409,
            ),
          );
        else if (err)
          reject(
            error(
              'Não foi possível consultar a Zcash testnet. Tente novamente; nenhum pagamento foi registrado.',
              'NETWORK_UNAVAILABLE',
              503,
            ),
          );
        else resolve(result);
      }),
    );
  }
  async height() {
    const info = await this.call('getLightdInfo', {});
    if (info.chainName !== 'test')
      throw error('O servidor Zcash não pertence à testnet.', 'WRONG_NETWORK', 503);
    const height = Number(info.blockHeight);
    if (!Number.isSafeInteger(height) || height < 1)
      throw error('Altura da Zcash indisponível.', 'NETWORK_UNAVAILABLE', 503);
    return height;
  }
  async confirm(intent, txid) {
    const tip = await this.height();
    const tx = await this.call('getTransaction', { hash: Buffer.from(txid, 'hex').reverse() });
    const height = Number(tx.height);
    if (!Number.isSafeInteger(height) || height < 1 || height > tip)
      throw error(
        'A transação ainda não foi confirmada na Zcash testnet.',
        'CONFIRMATION_PENDING',
        409,
      );
    if (height < intent.minHeight)
      throw error('A transação é anterior a este pedido.', 'TRANSACTION_MISMATCH');
    const state = await this.call('getTreeState', { height: String(height) });
    if (
      state.network !== 'test' ||
      Number(state.height) !== height ||
      !/^[a-f0-9]{64}$/i.test(state.hash)
    )
      throw error('Não foi possível conferir o bloco Zcash.', 'NETWORK_UNAVAILABLE', 503);
    const block = await this.call('getBlock', { height: String(height) });
    if (
      Number(block.height) !== height ||
      Buffer.from(block.hash).reverse().toString('hex') !== state.hash.toLowerCase() ||
      !block.vtx.some((item) => Buffer.from(item.txid).reverse().toString('hex') === txid)
    )
      throw error('A transação não foi encontrada no bloco confirmado.', 'TRANSACTION_MISMATCH');
    const outputs = transparentOutputs(tx.data);
    const matching = outputs.filter(
      (out) => out.script === zcashReceiverScript(intent.receiver) && out.units === intent.units,
    );
    if (matching.length !== 1)
      throw error(
        'O destinatário ou o valor não corresponde a este pedido.',
        'TRANSACTION_MISMATCH',
      );
    return {
      txid,
      height,
      blockHash: state.hash,
      confirmations: tip - height + 1,
      outputIndex: matching[0].index,
    };
  }
  close() {
    this.client.close();
  }
}
