import { randomBytes, randomUUID } from 'node:crypto';
import { digest } from './ledger.js';
import { unitsAmount } from './payments.js';

const precision = { solana: 9, zcash: 8 };
const error = (message, code, status = 400) => Object.assign(new Error(message), { code, status });
const coinIds = { solana: 'solana', zcash: 'zcash' };
const asset = (network) => (network === 'solana' ? 'SOL' : 'ZEC');

export class DemoQuotes {
  constructor({ fetchPrices = fetch, now = () => Date.now() } = {}) {
    this.fetchPrices = fetchPrices;
    this.now = now;
    this.cache = null;
    this.inflight = null;
  }
  async get() {
    if (
      this.cache &&
      this.now() - this.cache.loadedAt < 300000 &&
      Object.values(this.cache.rates).every(
        (rate) => rate.basis === 'fictional' || this.now() - Date.parse(rate.quotedAt) <= 900000,
      )
    )
      return this.cache;
    if (this.inflight) return this.inflight;
    this.inflight = this.load().finally(() => {
      this.inflight = null;
    });
    return this.inflight;
  }
  async load() {
    let data;
    try {
      const response = await this.fetchPrices(
        'https://api.coingecko.com/api/v3/simple/price?ids=solana,zcash&vs_currencies=brl&include_last_updated_at=true',
        { signal: AbortSignal.timeout(7000) },
      );
      if (!response.ok) throw new Error('Cotação indisponível.');
      data = await response.json();
    } catch {
      data = null;
    }
    const now = this.now();
    const rates = Object.fromEntries(
      Object.entries(coinIds).map(([network, id]) => {
        const info = data?.[id];
        const timestamp = Number(info?.last_updated_at) * 1000;
        const cents = Math.round(Number(info?.brl) * 100);
        const fresh =
          Number.isSafeInteger(cents) &&
          cents > 0 &&
          cents <= 1000000000 &&
          timestamp <= now + 60000 &&
          timestamp >= now - 900000;
        return [
          network,
          {
            network,
            asset: asset(network),
            rateCents: fresh ? cents : network === 'solana' ? 100000 : 20000,
            source: fresh ? 'CoinGecko' : 'Exemplo fictício de treinamento',
            basis: fresh ? 'market-reference' : 'fictional',
            quotedAt: fresh ? new Date(timestamp).toISOString() : null,
          },
        ];
      }),
    );
    this.cache = {
      id: digest(rates),
      rates,
      loadedAt: now,
      retrievedAt: new Date(now).toISOString(),
      simulated: true,
    };
    return this.cache;
  }
}

export function demoUnits(amount) {
  if (typeof amount !== 'string' || !/^\d+(?:[.,]\d{1,2})?$/.test(amount))
    throw error('Informe um valor em reais com até duas casas decimais.', 'INVALID_AMOUNT');
  const [whole, fraction = ''] = amount.replace(',', '.').split('.');
  const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  if (cents < 100n || cents > 1000000n)
    throw error('Adicione de R$ 1 a R$ 10.000 fictícios por vez.', 'INVALID_AMOUNT');
  return Number(cents);
}

export class DemoExchange {
  constructor(store, quotes = new DemoQuotes()) {
    this.store = store;
    this.quotes = quotes;
  }
  async wallet(token) {
    if (!token || !/^[a-zA-Z0-9_-]{32}$/.test(token)) return null;
    const { rows } = await this.store.execute({
      sql: 'SELECT payload FROM demo_wallets WHERE key_hash = ?',
      args: [digest(token)],
    });
    return rows[0] ? JSON.parse(rows[0].payload) : null;
  }
  async open(token) {
    const wallet = await this.wallet(token);
    if (wallet) return { token, wallet };
    token = randomBytes(24).toString('base64url');
    const next = {
      brlCents: 0,
      units: { solana: '0', zcash: '0' },
      createdAt: new Date().toISOString(),
    };
    await this.store.execute({
      sql: 'INSERT INTO demo_wallets (key_hash, payload) VALUES (?, ?)',
      args: [digest(token), JSON.stringify(next)],
    });
    return { token, wallet: next };
  }
  async state(token) {
    const wallet = await this.wallet(token);
    if (!wallet)
      throw error(
        'Abra novamente o simulador para iniciar seu saldo fictício.',
        'DEMO_SESSION_REQUIRED',
        401,
      );
    return {
      ...wallet,
      simulated: true,
      balances: {
        solana: unitsAmount(wallet.units.solana, 'solana'),
        zcash: unitsAmount(wallet.units.zcash, 'zcash'),
      },
    };
  }
  async operation(token, kind, input, consent, userId = null) {
    if (!token || !/^[a-zA-Z0-9_-]{32}$/.test(token))
      throw error('Abra novamente o simulador.', 'DEMO_SESSION_REQUIRED', 401);
    const key = digest(token);
    const fingerprint = digest(input);
    const replay = await this.store.execute({
      sql: 'SELECT wallet_hash, kind, fingerprint, payload FROM demo_operations WHERE request_key = ?',
      args: [input.requestKey],
    });
    if (replay.rows[0]) {
      const row = replay.rows[0];
      if (row.wallet_hash !== key || row.kind !== kind || row.fingerprint !== fingerprint)
        throw error('Este identificador já foi utilizado.', 'REQUEST_CONFLICT', 409);
      return { ...JSON.parse(row.payload), wallet: await this.state(token) };
    }
    let quote;
    if (kind === 'convert') {
      quote = await this.quotes.get();
      if (quote.id !== input.quoteId)
        throw error(
          'A referência mudou. Confira o cálculo atualizado e tente novamente.',
          'QUOTE_CHANGED',
          409,
        );
    }
    return this.store.transaction(async () => {
      const previous = await this.store.execute({
        sql: 'SELECT wallet_hash, kind, fingerprint, payload FROM demo_operations WHERE request_key = ?',
        args: [input.requestKey],
      });
      if (previous.rows[0]) {
        const row = previous.rows[0];
        if (row.wallet_hash !== key || row.kind !== kind || row.fingerprint !== fingerprint)
          throw error('Este identificador já foi utilizado.', 'REQUEST_CONFLICT', 409);
        return { ...JSON.parse(row.payload), wallet: await this.state(token) };
      }
      const wallet = await this.wallet(token);
      if (!wallet) throw error('Abra novamente o simulador.', 'DEMO_SESSION_REQUIRED', 401);
      const result = {
        id: randomUUID(),
        kind,
        simulated: true,
        createdAt: new Date().toISOString(),
      };
      if (kind === 'credit') {
        result.brlCents = demoUnits(input.amount);
        if (wallet.brlCents + result.brlCents > 10000000)
          throw error('O limite do saldo fictício é R$ 100.000.', 'BALANCE_LIMIT');
        wallet.brlCents += result.brlCents;
      } else if (kind === 'convert') {
        result.brlCents = demoUnits(input.amount);
        if (result.brlCents > wallet.brlCents)
          throw error('Adicione reais fictícios antes de converter.', 'INSUFFICIENT_DEMO_BALANCE');
        const rate = quote.rates[input.network];
        result.network = input.network;
        result.asset = asset(input.network);
        result.units = (
          (BigInt(result.brlCents) * 10n ** BigInt(precision[input.network])) /
          BigInt(rate.rateCents)
        ).toString();
        if (result.units === '0')
          throw error('O valor é pequeno demais para esta referência.', 'INVALID_AMOUNT');
        result.amount = unitsAmount(result.units, input.network);
        result.quote = { ...rate, id: quote.id };
        wallet.brlCents -= result.brlCents;
        wallet.units[input.network] = (
          BigInt(wallet.units[input.network]) + BigInt(result.units)
        ).toString();
      } else if (kind === 'donate') {
        const campaign = await this.store.campaign(input.campaignId);
        if (
          !campaign ||
          campaign.status !== 'active' ||
          new Date(`${campaign.deadline}T23:59:59-03:00`) < new Date()
        )
          throw error('A campanha não está recebendo contribuições.', 'CAMPAIGN_UNAVAILABLE');
        if (
          !/^\d+$/.test(input.units) ||
          BigInt(input.units) <= 0n ||
          BigInt(input.units) > BigInt(wallet.units[input.network])
        )
          throw error(
            'Seu saldo fictício não cobre esta contribuição.',
            'INSUFFICIENT_DEMO_BALANCE',
          );
        result.campaignId = campaign.id;
        result.network = input.network;
        result.asset = asset(input.network);
        result.units = BigInt(input.units).toString();
        result.amount = unitsAmount(result.units, input.network);
        result.status = 'simulated';
        wallet.units[input.network] = (
          BigInt(wallet.units[input.network]) - BigInt(result.units)
        ).toString();
        const commitment = {
          id: result.id,
          campaignId: campaign.id,
          network: input.network,
          units: result.units,
          simulated: true,
        };
        const entry = await this.store.append(campaign.id, {
          type: 'demo_crypto_donation',
          amount: 0,
          referenceId: result.id,
          evidenceHash: digest(commitment),
        });
        result.ledgerId = entry.id;
        result.commitment = commitment;
        await this.store.execute({
          sql: 'INSERT INTO demo_crypto_donations (id, campaign_id, payload) VALUES (?, ?, ?)',
          args: [result.id, campaign.id, JSON.stringify({ ...result, acceptance: consent })],
        });
        await this.store.linkContribution('virtual', result.id, userId);
      } else throw error('Operação inválida.', 'INVALID_OPERATION');
      await this.store.execute({
        sql: 'UPDATE demo_wallets SET payload = ? WHERE key_hash = ?',
        args: [JSON.stringify(wallet), key],
      });
      await this.store.execute({
        sql: 'INSERT INTO demo_operations (request_key, wallet_hash, kind, fingerprint, payload) VALUES (?, ?, ?, ?, ?)',
        args: [input.requestKey, key, kind, fingerprint, JSON.stringify(result)],
      });
      return { ...result, wallet: await this.state(token) };
    });
  }
}
