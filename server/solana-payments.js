import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  SystemInstruction,
} from '@solana/web3.js';
import bs58 from 'bs58';
import { devnetGenesisHash, memoProgram } from './solana.js';

const failure = (message, code, status = 400) =>
  Object.assign(new Error(message), { code, status });
export class SolanaPayments {
  constructor(rpcUrl) {
    this.rpcUrl = rpcUrl;
    this.connection = new Connection(rpcUrl, {
      commitment: 'confirmed',
      disableRetryOnRateLimit: true,
      fetch: (url, options) => fetch(url, { ...options, signal: AbortSignal.timeout(15000) }),
    });
  }
  async network() {
    if ((await this.connection.getGenesisHash()) !== devnetGenesisHash)
      throw failure('O RPC não pertence à Solana devnet.', 'WRONG_NETWORK', 503);
  }
  async prepare() {
    await this.network();
    return this.connection.getLatestBlockhash('confirmed');
  }
  signed(intent, serialized) {
    const tx = Transaction.from(Buffer.from(serialized, 'base64'));
    if (
      tx.instructions.length !== 2 ||
      !tx.verifySignatures() ||
      !tx.feePayer?.equals(new PublicKey(intent.payer)) ||
      tx.recentBlockhash !== intent.blockhash
    )
      throw failure('A transação assinada não corresponde ao pedido.', 'TRANSACTION_MISMATCH');
    const transfer = SystemInstruction.decodeTransfer(tx.instructions[0]);
    const memo = tx.instructions[1];
    if (
      !transfer.fromPubkey.equals(new PublicKey(intent.payer)) ||
      !transfer.toPubkey.equals(new PublicKey(intent.receiver)) ||
      BigInt(transfer.lamports).toString() !== intent.units ||
      !memo.programId.equals(new PublicKey(memoProgram)) ||
      memo.data.toString('utf8') !== intent.memo ||
      memo.keys.length !== 1 ||
      !memo.keys[0].pubkey.equals(tx.feePayer) ||
      !memo.keys[0].isSigner
    )
      throw failure(
        'A transação deve conter somente o pagamento e a referência deste pedido.',
        'TRANSACTION_MISMATCH',
      );
    return { bytes: tx.serialize(), txid: bs58.encode(tx.signature) };
  }
  async send(bytes) {
    await this.network();
    return this.connection.sendRawTransaction(bytes, {
      preflightCommitment: 'confirmed',
      maxRetries: 3,
    });
  }
  async confirm(intent, txid) {
    await this.network();
    const tx = await this.connection.getParsedTransaction(txid, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0,
    });
    if (!tx) {
      const [height, status] = await Promise.all([
        this.connection.getBlockHeight('confirmed'),
        this.connection.getSignatureStatuses([txid], { searchTransactionHistory: true }),
      ]);
      if (status.value[0]?.err)
        throw failure('A transação falhou na Solana.', 'TRANSACTION_FAILED');
      if (height > intent.lastValidBlockHeight && !status.value[0])
        throw failure(
          'A transação expirou sem confirmação. Crie outro pedido.',
          'TRANSACTION_EXPIRED',
          410,
        );
      throw failure('A transação ainda não foi confirmada na devnet.', 'CONFIRMATION_PENDING', 409);
    }
    if (!tx.meta || tx.meta.err)
      throw failure('A transação falhou na Solana.', 'TRANSACTION_FAILED');
    const keys = tx.transaction.message.accountKeys;
    const instructions = tx.transaction.message.instructions;
    const transfer = instructions.find(
      (i) =>
        i.programId.toString() === SystemProgram.programId.toBase58() &&
        i.parsed?.type === 'transfer',
    );
    const memo = instructions.find(
      (i) => i.programId.toString() === memoProgram && i.parsed === intent.memo,
    );
    if (
      instructions.length !== 2 ||
      !keys.find((k) => k.signer && k.pubkey.toString() === intent.payer) ||
      !transfer ||
      transfer.parsed.info.source !== intent.payer ||
      transfer.parsed.info.destination !== intent.receiver ||
      String(transfer.parsed.info.lamports) !== intent.units ||
      !memo
    )
      throw failure(
        'O destinatário, o valor ou a referência não corresponde ao pedido.',
        'TRANSACTION_MISMATCH',
      );
    return {
      txid,
      slot: tx.slot,
      explorerUrl: `https://explorer.solana.com/tx/${txid}?cluster=devnet`,
    };
  }
}
