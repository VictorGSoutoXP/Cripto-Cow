import { randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { digest } from './ledger.js';
import { getAcceptance } from './legal.js';
import { validateWallet, memoProgram } from './solana.js';
import { zcashPaymentRequest, validateZcashAddress } from './zcash.js';
import { SolanaPayments } from './solana-payments.js';
import { ZcashChain } from './zcash-chain.js';
import demoReceivers from '../shared/demo-payment-receivers.json' with { type: 'json' };

const fail = (message, code, status = 400) => Object.assign(new Error(message), { status, code });
const decimals = { solana: 9, zcash: 8 };
export function amountUnits(amount, network) {
  const precision = decimals[network];
  if (
    !precision ||
    typeof amount !== 'string' ||
    !new RegExp(`^(?:0|[1-9]\\d{0,2})(?:\\.\\d{1,${precision}})?$`).test(amount)
  )
    throw fail('Informe um valor válido na moeda selecionada.', 'INVALID_AMOUNT');
  const [whole, fraction = ''] = amount.split('.');
  const units = BigInt(whole) * 10n ** BigInt(precision) + BigInt(fraction.padEnd(precision, '0'));
  if (units < 100000n || units > 10n * 10n ** BigInt(precision))
    throw fail(
      'Use um valor de teste entre 0,0001 e 10 SOL, ou entre 0,001 e 10 ZEC.',
      'INVALID_AMOUNT',
    );
  return units.toString();
}
export function unitsAmount(units, network) {
  const p = decimals[network];
  const value = BigInt(units)
    .toString()
    .padStart(p + 1, '0');
  return `${value.slice(0, -p)}.${value.slice(-p)}`;
}
export function paymentReceivers(campaign) {
  return (
    campaign.cryptoReceivers ??
    (!campaign.ownerId && ['horta-do-amanha', 'patas-em-casa', 'recomecar'].includes(campaign.id)
      ? demoReceivers
      : {})
  );
}
export function publicPayment(intent) {
  const { tokenHash, requestKey, acceptance, donor, ...receipt } = intent;
  if (intent.status === 'confirmed') return { ...receipt, donor };
  return receipt;
}
export class Payments {
  constructor(store, options) {
    this.store = store;
    this.solana = options.solanaPayments ?? new SolanaPayments(options.rpcUrl);
    this.zcash = options.zcashChain ?? new ZcashChain(options.zcashEndpoint);
  }
  async get(id, token) {
    const { rows } = await this.store.execute({
      sql: 'SELECT payload FROM crypto_payments WHERE id = ?',
      args: [id],
    });
    const intent = rows[0] && JSON.parse(rows[0].payload);
    if (
      !intent ||
      typeof token !== 'string' ||
      token.length > 100 ||
      !timingSafeEqual(Buffer.from(digest(token)), Buffer.from(intent.tokenHash))
    )
      throw fail(
        'Pedido não encontrado. Use o recibo guardado neste navegador.',
        'PAYMENT_NOT_FOUND',
        404,
      );
    return intent;
  }
  async save(intent) {
    await this.store.execute({
      sql: 'UPDATE crypto_payments SET txid = ?, payload = ? WHERE id = ?',
      args: [intent.txid ?? null, JSON.stringify(intent), intent.id],
    });
  }
  async methods(campaign) {
    const receivers = paymentReceivers(campaign);
    return {
      testnetOnly: true,
      directToReceiver: true,
      methods: ['solana', 'zcash'].map((network) => ({
        network,
        asset: network === 'solana' ? 'SOL' : 'ZEC',
        chain: network === 'solana' ? 'devnet' : 'testnet',
        available:
          Boolean(receivers[network]) &&
          campaign.status === 'active' &&
          new Date(`${campaign.deadline}T23:59:59-03:00`) >= new Date(),
        receiver: receivers[network] ?? null,
        demoReceiver: !campaign.cryptoReceivers && !campaign.ownerId,
      })),
    };
  }
  async create(campaignId, input, acceptance, userId = null) {
    const campaign = await this.store.campaign(campaignId);
    if (
      !campaign ||
      campaign.status !== 'active' ||
      new Date(`${campaign.deadline}T23:59:59-03:00`) < new Date()
    )
      throw fail('Esta campanha não está recebendo contribuições.', 'CAMPAIGN_UNAVAILABLE');
    const receiver = paymentReceivers(campaign)[input.network];
    if (!receiver)
      throw fail(
        'O organizador ainda não definiu a carteira desta campanha.',
        'RECEIVER_UNAVAILABLE',
        409,
      );
    let units = amountUnits(input.amount, input.network);
    const existing = await this.store.execute({
      sql: 'SELECT payload FROM crypto_payments WHERE request_key = ?',
      args: [input.requestKey],
    });
    if (existing.rows[0])
      throw fail(
        'Já existe um pedido com este identificador. Retome o recibo anterior.',
        'REQUEST_EXISTS',
        409,
      );
    const id = randomUUID();
    const token = randomBytes(24).toString('base64url');
    let prepared;
    if (input.network === 'solana') {
      validateWallet(receiver);
      validateWallet(input.payer);
      if (input.payer === receiver)
        throw fail('Use uma carteira doadora diferente do destinatário.', 'INVALID_PAYER');
      prepared = await this.solana.prepare();
    } else {
      validateZcashAddress(receiver);
      prepared = { minHeight: (await this.zcash.height()) + 1 };
    }
    for (let attempt = 0; attempt < 8; attempt++) {
      // The exact ZEC amount identifies this request without a shielded memo.
      if (input.network === 'zcash')
        units = (
          BigInt(amountUnits(input.amount, input.network)) + BigInt(randomInt(1, 10000))
        ).toString();
      const intent = {
        id,
        campaignId,
        requestKey: input.requestKey,
        tokenHash: digest(token),
        network: input.network,
        chain: input.network === 'solana' ? 'devnet' : 'testnet',
        asset: input.network === 'solana' ? 'SOL' : 'ZEC',
        receiver,
        units,
        amount: unitsAmount(units, input.network),
        requestedAmount: input.amount,
        payer: input.network === 'solana' ? input.payer : undefined,
        memo: input.network === 'solana' ? `cripto-cow:donation:v1:${id}` : undefined,
        uri:
          input.network === 'zcash'
            ? zcashPaymentRequest(receiver, unitsAmount(units, input.network))
            : undefined,
        ...prepared,
        status: 'pending',
        testnetOnly: true,
        createdAt: new Date().toISOString(),
        donor: input.donor,
        acceptance: { ...acceptance, acceptedAt: new Date().toISOString() },
      };
      try {
        await this.store.transaction(async () => {
          await this.store.execute({
            sql: 'INSERT INTO crypto_payments (id, campaign_id, request_key, network, receiver, units, payload) VALUES (?, ?, ?, ?, ?, ?, ?)',
            args: [
              id,
              campaignId,
              input.requestKey,
              input.network,
              receiver,
              units,
              JSON.stringify(intent),
            ],
          });
          await this.store.linkContribution('testnet', id, userId);
        });
        return { ...publicPayment(intent), token, memoProgram };
      } catch (error) {
        if (
          input.network !== 'zcash' ||
          !String(error.message).includes(
            'UNIQUE constraint failed: crypto_payments.network, crypto_payments.receiver, crypto_payments.units',
          )
        )
          throw error;
      }
    }
    throw fail(
      'Não foi possível preparar um valor exclusivo. Tente novamente.',
      'REQUEST_CONFLICT',
      409,
    );
  }
  async submit(id, token, serialized) {
    const intent = await this.get(id, token);
    if (intent.network !== 'solana')
      throw fail('Envie ZEC pela carteira e informe o TXID.', 'WRONG_METHOD');
    const signed = this.solana.signed(intent, serialized);
    await this.store.transaction(async () => {
      const current = await this.get(id, token);
      if (current.txid && current.txid !== signed.txid)
        throw fail(
          'Este pedido já tem uma transação. Confira a confirmação antes de tentar outro pagamento.',
          'TRANSACTION_EXISTS',
          409,
        );
      if (current.status !== 'confirmed') await this.save({ ...current, txid: signed.txid });
    });
    if (intent.status !== 'confirmed') await this.solana.send(signed.bytes);
    return { txid: signed.txid };
  }
  async confirm(id, token, txid) {
    const intent = await this.get(id, token);
    if (intent.txid && intent.txid !== txid)
      throw fail('Este pedido já está associado a outra transação.', 'TRANSACTION_EXISTS', 409);
    if (intent.status === 'confirmed') return publicPayment(intent);
    const proof = await (intent.network === 'solana' ? this.solana : this.zcash).confirm(
      intent,
      txid,
    );
    return this.store.transaction(async () => {
      const current = await this.get(id, token);
      if (current.txid && current.txid !== txid)
        throw fail('Este pedido já está associado a outra transação.', 'TRANSACTION_EXISTS', 409);
      if (current.status === 'confirmed') return publicPayment(current);
      const receipt = {
        ...current,
        ...proof,
        status: 'confirmed',
        confirmedAt: new Date().toISOString(),
      };
      const commitment = {
        id,
        campaignId: current.campaignId,
        network: current.network,
        receiver: current.receiver,
        units: current.units,
        txid,
        ...proof,
      };
      const entry = await this.store.append(current.campaignId, {
        type: 'crypto_donation',
        amount: 0,
        referenceId: id,
        evidenceHash: digest(commitment),
      });
      receipt.ledgerId = entry.id;
      receipt.commitment = commitment;
      try {
        await this.save(receipt);
      } catch (err) {
        if (String(err.message).includes('UNIQUE'))
          throw fail(
            'Esta transação já foi registrada em outro pedido.',
            'TRANSACTION_REUSED',
            409,
          );
        throw err;
      }
      return publicPayment(receipt);
    });
  }
}

export const cryptoPaymentSchema = z.strictObject({
  network: z.enum(['solana', 'zcash']),
  amount: z.string().max(20),
  payer: z.string().max(60).optional(),
  requestKey: z.uuid(),
  donor: z.object({ type: z.literal('anonymous') }).default({ type: 'anonymous' }),
  accepted: z.literal(true),
  termsVersion: z.string().max(100),
  termsHash: z.string().max(128),
});
