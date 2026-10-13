import express from 'express';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { resolve } from 'node:path';
import { z } from 'zod';
import { digest, verifyEntries } from './ledger.js';
import { getAcceptance, getLegalManifest } from './legal.js';
import { donorSchema } from './donors.js';
import { Accounts, sessionDuration, sessionToken } from './accounts.js';
import { ProfileWallets } from './profile-wallets.js';
import { zcashPaymentRequest } from './zcash.js';
import { Payments, cryptoPaymentSchema, publicPayment, unitsAmount } from './payments.js';
import { DemoExchange, convertedUnits, demoUnits } from './demo-exchange.js';
import { profileContributions } from './contributions.js';
import {
  anchorMemo,
  confirmAnchor,
  getBlockhash,
  memoProgram,
  validateWallet,
  submitAnchor,
} from './solana.js';

const text = (min, max) => z.string().trim().min(min).max(max);
const money = z.number().int().min(100).max(100000000);
const acceptanceFields = {
  accepted: z.literal(true),
  termsVersion: z.string().max(100).optional(),
  termsHash: z.string().max(128).optional(),
};
const campaignSchema = z.object({
  title: text(8, 100),
  description: text(30, 1200),
  organization: text(3, 60),
  location: text(3, 60),
  category: z.enum(['Comunidade', 'Animais', 'Emergência', 'Educação', 'Saúde']),
  deadline: z.iso.date(),
  budget: z
    .array(z.object({ name: text(3, 60), planned: money }))
    .min(1)
    .max(8),
  ...acceptanceFields,
});
const expenseSchema = z.object({
  title: text(5, 100),
  supplier: text(3, 80),
  categoryId: text(1, 80),
  amount: money,
  evidenceSummary: text(30, 1500),
});
const credentialsSchema = z.strictObject({
  email: z.string().trim().max(254).email().toLowerCase(),
  password: z.string().min(1).max(128),
});
const registrationSchema = credentialsSchema.extend({
  name: text(2, 60),
  password: z.string().min(12).max(128),
  ...acceptanceFields,
});

function publicCampaign({ ownerId, ...campaign }) {
  return campaign;
}

export function createApp(store, options = {}) {
  const app = express();
  const demo = options.demo ?? process.env.DEMO_MODE !== 'false';
  const password = options.password ?? process.env.ADMIN_PASSWORD;
  const rpcUrl = options.rpcUrl ?? process.env.SOLANA_RPC_URL ?? 'https://api.devnet.solana.com';
  const production = options.production ?? process.env.NODE_ENV === 'production';
  const sessions = new Map();
  const accounts = new Accounts(store);
  const contributorId = async (req) => (await accounts.current(sessionToken(req)))?.id ?? null;
  const wallets = new ProfileWallets(store);
  const payments = new Payments(store, { ...options, rpcUrl });
  const demoExchange = new DemoExchange(store, options.demoQuotes);
  const demoToken = (req) =>
    (req.get('cookie') ?? '')
      .split(';')
      .map((item) => item.trim())
      .find((item) => item.startsWith('cow_demo_wallet='))
      ?.slice('cow_demo_wallet='.length);
  const rate = new Map();
  const authRate = new Map();
  app.disable('x-powered-by');
  app.set('trust proxy', options.trustProxy ?? false);
  app.use(express.json({ limit: '32kb' }));
  app.use((req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.set('X-Frame-Options', 'DENY');
    if (req.path.startsWith('/api')) res.set('Cache-Control', 'no-store');
    if (['POST', 'PATCH', 'DELETE'].includes(req.method)) {
      const origin = req.get('origin');
      const host = req.get('host');
      const allowed = new Set([
        `http://${host}`,
        `https://${host}`,
        'http://127.0.0.1:5173',
        'http://localhost:5173',
      ]);
      if ((origin && !allowed.has(origin)) || req.get('sec-fetch-site') === 'cross-site')
        return res.status(403).json({ error: 'Origem não autorizada.' });
      if (!req.is('application/json'))
        return res.status(415).json({ error: 'Envie os dados em JSON.' });
      const now = Date.now();
      const key = req.ip;
      const record = rate.get(key);
      if (!record || record.expires < now) rate.set(key, { count: 1, expires: now + 60000 });
      else if (++record.count > 40)
        return res
          .status(429)
          .json({ error: 'Muitas solicitações. Tente novamente em um minuto.' });
      if (rate.size > 1000) for (const [ip, item] of rate) if (item.expires < now) rate.delete(ip);
    }
    next();
  });

  const authenticated = async (req, res, next) => {
    const token = sessionToken(req);
    const session = sessions.get(token);
    if (session && session.expires > Date.now())
      req.account = { id: null, name: 'Administração', role: 'admin' };
    else {
      sessions.delete(token);
      req.account = await accounts.current(token);
    }
    if (!req.account)
      return res
        .status(401)
        .json({ error: 'Entre na sua conta para continuar.', code: 'SESSION_REQUIRED' });
    next();
  };
  const admin = [
    authenticated,
    (req, res, next) => {
      if (req.account.role !== 'admin')
        return res
          .status(403)
          .json({ error: 'Esta ação é reservada à moderação.', code: 'FORBIDDEN' });
      next();
    },
  ];
  const individual = [
    authenticated,
    (req, res, next) => {
      if (!req.account.id)
        return res.status(403).json({
          error: 'Entre com uma conta individual para acessar o perfil.',
          code: 'INDIVIDUAL_ACCOUNT_REQUIRED',
        });
      next();
    },
  ];
  const limitAuthentication = (req, res, next) => {
    const now = Date.now();
    for (const [key, record] of authRate) if (record.expires <= now) authRate.delete(key);
    const record = authRate.get(req.ip);
    if (record && ++record.count > 10)
      return res.status(429).json({
        error: 'Muitas tentativas de acesso. Aguarde um minuto.',
        code: 'AUTH_RATE_LIMIT',
      });
    if (!record) authRate.set(req.ip, { count: 1, expires: now + 60000 });
    next();
  };
  const setSessionCookie = (req, res, token) =>
    res.cookie('elo_session', token, {
      httpOnly: true,
      sameSite: 'strict',
      secure: production || req.secure,
      maxAge: sessionDuration,
      path: '/',
    });
  const demoOnly = (req, res, next) =>
    demo
      ? next()
      : res.status(403).json({
          error:
            'Operação demonstrativa desativada. O parceiro de pagamento ainda não foi integrado.',
        });
  const requireCampaign = async (id) => {
    const campaign = await store.campaign(id);
    if (!campaign) throw Object.assign(new Error('Campanha não encontrada.'), { status: 404 });
    return campaign;
  };
  const requireOwnedCampaign = async (req, id) => {
    const campaign = await requireCampaign(id);
    if (req.account.role !== 'admin' && campaign.ownerId !== req.account.id)
      throw Object.assign(new Error('Você não tem acesso a esta campanha.'), {
        status: 403,
        code: 'FORBIDDEN',
      });
    return campaign;
  };
  const requireAcceptance = (input, role) => {
    const acceptance = getAcceptance(role);
    if (input.termsVersion !== acceptance.version || input.termsHash !== acceptance.hash)
      throw Object.assign(
        new Error('As políticas foram atualizadas. Recarregue a página, leia e aceite novamente.'),
        { status: 409, code: 'TERMS_CHANGED' },
      );
    return acceptance;
  };

  app.get('/api/legal', (req, res) => res.json(getLegalManifest()));
  app.get('/api/health', async (req, res) => {
    try {
      await store.db.execute('SELECT 1');
      res.json({ status: 'ok', demo, network: 'devnet' });
    } catch {
      res.status(503).json({ status: 'unavailable' });
    }
  });
  app.get('/api/campaigns', async (req, res) => {
    const campaigns = await Promise.all(
      (await store.list('campaigns'))
        .filter((item) => item.status !== 'draft')
        .map(async (item) => {
          const { ledger, expenses, donations, ...campaign } = await store.campaign(item.id);
          return publicCampaign(campaign);
        }),
    );
    res.json({ campaigns, demo });
  });
  app.get('/api/campaigns/:id', async (req, res) => {
    const campaign = await requireCampaign(req.params.id);
    if (campaign.status === 'draft')
      return res.status(404).json({ error: 'Esta campanha ainda não foi publicada.' });
    res.json(publicCampaign(campaign));
  });
  app.get('/api/campaigns/:id/ledger', async (req, res) => {
    const campaign = await requireCampaign(req.params.id);
    if (campaign.status === 'draft')
      return res.status(404).json({ error: 'Esta campanha ainda não foi publicada.' });
    res.attachment(`ledger-${campaign.id}.json`).json({
      version: 1,
      algorithm: 'SHA-256',
      campaignId: campaign.id,
      entries: campaign.ledger,
      cryptoPayments: campaign.cryptoPayments,
      simulatedCryptoDonations: campaign.simulatedCryptoDonations,
      anchors: campaign.anchors.map(({ wallet, ...anchor }) => anchor),
    });
  });
  app.get('/api/campaigns/:id/verify', async (req, res) => {
    const campaign = await requireCampaign(req.params.id);
    if (campaign.status === 'draft')
      return res.status(404).json({ error: 'Esta campanha ainda não foi publicada.' });
    const integrity = verifyEntries(campaign.ledger);
    const anchors = campaign.anchors.map((anchor) => ({
      ...anchor,
      matchesHistory: verifyEntries(campaign.ledger.slice(0, anchor.count)).root === anchor.root,
    }));
    res.json({ ...integrity, anchors });
  });
  app.post('/api/campaigns/:id/donations', demoOnly, async (req, res) => {
    const input = z
      .object({
        amount: money.max(1000000),
        requestKey: z.uuid(),
        donor: donorSchema,
        ...acceptanceFields,
      })
      .parse(req.body);
    requireAcceptance(input, 'donor');
    res
      .status(201)
      .json(
        await store.donate(
          req.params.id,
          input.amount,
          input.requestKey,
          input.accepted,
          input.donor,
          await contributorId(req),
        ),
      );
  });
  app.get('/api/campaigns/:id/payment-methods', async (req, res) => {
    const campaign = await requireCampaign(req.params.id);
    if (campaign.status === 'draft')
      return res.status(404).json({ error: 'Campanha não publicada.' });
    res.json(await payments.methods(campaign));
  });
  app.get('/api/demo-exchange/quote', demoOnly, async (req, res) =>
    res.set('Cache-Control', 'no-store').json(await demoExchange.quotes.get()),
  );
  app.post('/api/demo-exchange/wallet', demoOnly, async (req, res) => {
    z.strictObject({}).parse(req.body);
    const opened = await demoExchange.open(demoToken(req));
    res.cookie('cow_demo_wallet', opened.token, {
      httpOnly: true,
      sameSite: 'strict',
      secure: production || req.secure,
      maxAge: sessionDuration,
      path: '/',
    });
    res.json(await demoExchange.state(opened.token));
  });
  for (const kind of ['credit', 'convert', 'donate', 'donate-brl'])
    app.post(`/api/demo-exchange/${kind}`, demoOnly, async (req, res) => {
      const shape =
        kind === 'credit'
          ? { amount: text(1, 20) }
          : kind === 'convert'
            ? { amount: text(1, 20), network: z.enum(['solana', 'zcash']), quoteId: text(64, 64) }
            : kind === 'donate-brl'
              ? {
                  campaignId: text(1, 100),
                  network: z.enum(['solana', 'zcash']),
                  amount: text(1, 20),
                  quoteId: text(64, 64),
                  ...acceptanceFields,
                }
              : {
                  campaignId: text(1, 100),
                  network: z.enum(['solana', 'zcash']),
                  units: z.string().regex(/^\d{1,20}$/),
                  ...acceptanceFields,
                };
      const input = z.strictObject({ requestKey: z.uuid(), ...shape }).parse(req.body);
      const isDonation = kind === 'donate' || kind === 'donate-brl';
      const consent = isDonation ? requireAcceptance(input, 'donor') : undefined;
      res.json(
        await demoExchange.operation(
          demoToken(req),
          kind,
          input,
          consent,
          isDonation ? await contributorId(req) : null,
        ),
      );
    });
  app.post('/api/campaigns/:id/crypto-payments', demoOnly, async (req, res) => {
    let input = cryptoPaymentSchema.parse(req.body);
    const acceptance = requireAcceptance(input, 'donor');
    if (input.brlAmount !== undefined) {
      const quote = await demoExchange.quotes.get();
      const rate = quote.rates[input.network];
      if (rate.basis !== 'market-reference')
        throw Object.assign(
          new Error(
            'A cotação de mercado está indisponível. Atualize ou informe o valor diretamente em moedas de teste.',
          ),
          { status: 503, code: 'QUOTE_UNAVAILABLE' },
        );
      if (input.quoteId !== quote.id)
        throw Object.assign(
          new Error('A cotação mudou. Confira o valor atualizado antes de preparar o pagamento.'),
          { status: 409, code: 'QUOTE_CHANGED' },
        );
      input = {
        ...input,
        amount: unitsAmount(convertedUnits(input.brlAmount, input.network, rate), input.network),
        brlReference: { cents: demoUnits(input.brlAmount), quoteId: quote.id, ...rate },
      };
    }
    res
      .status(201)
      .json(await payments.create(req.params.id, input, acceptance, await contributorId(req)));
  });
  app.post('/api/crypto-payments/:id/status', demoOnly, async (req, res) => {
    const { token } = z.strictObject({ token: text(20, 100) }).parse(req.body);
    res.json(publicPayment(await payments.get(req.params.id, token)));
  });
  app.post('/api/crypto-payments/:id/submit', demoOnly, async (req, res) => {
    const { token, transaction } = z
      .strictObject({ token: text(20, 100), transaction: text(1, 4000) })
      .parse(req.body);
    res.json(await payments.submit(req.params.id, token, transaction));
  });
  app.post('/api/crypto-payments/:id/confirm', demoOnly, async (req, res) => {
    const { token, txid } = z
      .strictObject({ token: text(20, 100), txid: text(64, 90) })
      .parse(req.body);
    const intent = await payments.get(req.params.id, token);
    if (
      !(intent.network === 'zcash' ? /^[a-f0-9]{64}$/i : /^[1-9A-HJ-NP-Za-km-z]{80,90}$/).test(txid)
    )
      return res.status(400).json({ error: 'Informe o identificador válido da transação.' });
    res.json(
      await payments.confirm(
        req.params.id,
        token,
        intent.network === 'zcash' ? txid.toLowerCase() : txid,
      ),
    );
  });
  app.put('/api/campaigns/:id/payment-receivers', ...individual, async (req, res) => {
    const campaign = await requireOwnedCampaign(req, req.params.id);
    const input = z
      .strictObject({ networks: z.array(z.enum(['solana', 'zcash'])).max(2) })
      .parse(req.body);
    const linked = await wallets.list(req.account.id);
    const receivers = Object.fromEntries(
      input.networks.map((network) => {
        const wallet = linked.find((item) => item.network === network);
        if (!wallet)
          throw Object.assign(
            new Error('Vincule e verifique sua carteira em Perfil e carteiras primeiro.'),
            { status: 409 },
          );
        return [network, wallet.address];
      }),
    );
    await store.transaction(async () => {
      const current = await store.get('campaigns', campaign.id);
      await store.save('campaigns', { ...current, cryptoReceivers: receivers });
    });
    res.json({ receivers });
  });
  app.post('/api/campaigns/:id/reports', demoOnly, async (req, res) => {
    const input = z
      .object({ reason: text(15, 1000), expenseId: z.uuid().optional() })
      .parse(req.body);
    const campaign = await requireCampaign(req.params.id);
    if (input.expenseId && !campaign.expenses.some((expense) => expense.id === input.expenseId))
      throw new Error('Gasto não encontrado nesta campanha.');
    const report = await store.save('reports', {
      ...input,
      id: randomUUID(),
      campaignId: campaign.id,
      status: 'pending',
      createdAt: new Date().toISOString(),
      simulated: true,
    });
    res.status(201).json({ id: report.id, status: report.status, createdAt: report.createdAt });
  });

  app.post('/api/auth/register', limitAuthentication, async (req, res) => {
    const input = registrationSchema.parse(req.body);
    const acceptance = requireAcceptance(input, 'account');
    const previousToken = sessionToken(req);
    const { user, token, recoveryCode } = await accounts.register(input, acceptance, previousToken);
    sessions.delete(previousToken);
    setSessionCookie(req, res, token);
    res.status(201).json({ authenticated: true, user, demo, recoveryCode });
  });
  app.post('/api/auth/recovery', limitAuthentication, async (req, res) => {
    const input = z
      .strictObject({
        email: credentialsSchema.shape.email,
        code: text(48, 64),
        password: z.string().min(12).max(128),
      })
      .parse(req.body);
    const previousToken = sessionToken(req);
    const { user, token, recoveryCode } = await accounts.recover(input, previousToken);
    sessions.delete(previousToken);
    setSessionCookie(req, res, token);
    res.json({ authenticated: true, user, demo, recoveryCode });
  });
  app.post('/api/auth/session', limitAuthentication, async (req, res) => {
    const input = credentialsSchema.parse(req.body);
    const previousToken = sessionToken(req);
    const { user, token } = await accounts.login(input, previousToken);
    sessions.delete(previousToken);
    setSessionCookie(req, res, token);
    res.json({ authenticated: true, user, demo });
  });
  app.post('/api/admin/session', limitAuthentication, async (req, res) => {
    const input = z.object({ password: z.string().max(200).optional() }).parse(req.body);
    const local =
      ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress) &&
      ['127.0.0.1', 'localhost', '[::1]'].includes(req.hostname);
    const localDemo = demo && local && !password && !production;
    const supplied = digest(input.password ?? '');
    const expected = digest(password ?? randomBytes(32).toString('hex'));
    if (!localDemo && (!password || !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))))
      return res.status(401).json({
        error: 'Senha inválida. Para acesso remoto, configure ADMIN_PASSWORD no servidor.',
      });
    for (const [key, value] of sessions) if (value.expires < Date.now()) sessions.delete(key);
    const previousToken = sessionToken(req);
    await accounts.revoke(previousToken);
    sessions.delete(previousToken);
    const token = randomBytes(32).toString('hex');
    sessions.set(token, { expires: Date.now() + sessionDuration });
    setSessionCookie(req, res, token);
    res.json({ authenticated: true, demo });
  });
  app.delete(['/api/admin/session', '/api/auth/session'], async (req, res) => {
    const token = sessionToken(req);
    await accounts.revoke(token);
    sessions.delete(token);
    res.clearCookie('elo_session');
    res.json({ authenticated: false });
  });
  app.get('/api/profile', individual, async (req, res) => {
    res.json({ user: req.account, wallets: await wallets.list(req.account.id) });
  });
  app.get('/api/profile/contributions', individual, async (req, res) => {
    const offset = z.coerce
      .number()
      .int()
      .min(0)
      .max(1000000)
      .parse(req.query.offset ?? 0);
    res.json(await profileContributions(store, req.account.id, offset));
  });
  app.patch('/api/profile', individual, async (req, res) => {
    const { name } = z.strictObject({ name: text(2, 60) }).parse(req.body);
    await store.execute({
      sql: 'UPDATE users SET display_name = ? WHERE id = ?',
      args: [name, req.account.id],
    });
    res.json({ user: { ...req.account, name } });
  });
  app.post('/api/profile/password', individual, limitAuthentication, async (req, res) => {
    const { currentPassword, password } = z
      .strictObject({
        currentPassword: z.string().min(1).max(128),
        password: z.string().min(12).max(128),
      })
      .parse(req.body);
    const { user, token, recoveryCode } = await accounts.changePassword(
      req.account.id,
      currentPassword,
      password,
      sessionToken(req),
    );
    setSessionCookie(req, res, token);
    res.json({ user, recoveryCode });
  });
  app.post('/api/profile/recovery', individual, limitAuthentication, async (req, res) => {
    const { password } = z.strictObject({ password: z.string().min(1).max(128) }).parse(req.body);
    const recoveryCode = await store.transaction(async () => {
      await accounts.requirePassword(req.account.id, password);
      return accounts.rotateRecovery(req.account.id);
    });
    res.json({ recoveryCode });
  });
  app.delete('/api/profile', individual, limitAuthentication, async (req, res) => {
    const { password } = z.strictObject({ password: z.string().min(1).max(128) }).parse(req.body);
    await accounts.close(req.account.id, password);
    res.clearCookie('elo_session');
    res.json({ closed: true });
  });
  app.post('/api/profile/wallets/challenge', individual, async (req, res) => {
    const { network, address } = z
      .strictObject({ network: z.enum(['solana', 'zcash']), address: text(32, 100) })
      .parse(req.body);
    const origin = req.get('origin') ?? `${req.protocol}://${req.get('host')}`;
    res.json(await wallets.prepare(req.account.id, network, address, origin));
  });
  app.post('/api/profile/wallets/confirm', individual, async (req, res) => {
    const { id, signature } = z
      .strictObject({ id: z.uuid(), signature: text(80, 100) })
      .parse(req.body);
    res.json({ wallets: await wallets.confirm(req.account.id, id, signature) });
  });
  app.delete('/api/profile/wallets/:network', individual, limitAuthentication, async (req, res) => {
    const network = z.enum(['solana', 'zcash']).parse(req.params.network);
    const { password } = z.strictObject({ password: z.string().min(1).max(128) }).parse(req.body);
    await store.transaction(async () => {
      await accounts.requirePassword(req.account.id, password);
      await wallets.remove(req.account.id, network);
    });
    res.json({ wallets: await wallets.list(req.account.id) });
  });
  app.post('/api/profile/wallets/zcash/request', individual, async (req, res) => {
    const { amount } = z.strictObject({ amount: text(1, 18) }).parse(req.body);
    const wallet = (await wallets.list(req.account.id)).find((item) => item.network === 'zcash');
    if (!wallet)
      return res.status(409).json({ error: 'Vincule primeiro seu endereço Zcash testnet.' });
    res.json({
      uri: zcashPaymentRequest(wallet.address, amount),
      network: 'testnet',
      asset: 'ZEC',
      reconciled: false,
    });
  });
  app.get('/api/admin', authenticated, async (req, res) => {
    const records = (await store.list('campaigns')).filter(
      (item) => req.account.role === 'admin' || item.ownerId === req.account.id,
    );
    const reports = req.account.role === 'admin' ? await store.list('reports') : [];
    const campaigns = await Promise.all(records.map((item) => store.campaign(item.id)));
    res.json({ campaigns: campaigns.map(publicCampaign), reports, demo, user: req.account });
  });
  app.post('/api/campaigns', authenticated, demoOnly, async (req, res) => {
    const input = campaignSchema.parse(req.body);
    const acceptance = requireAcceptance(input, 'organizer');
    if (new Date(`${input.deadline}T23:59:59-03:00`) <= new Date())
      throw new Error('Escolha uma data de encerramento no futuro.');
    const { accepted, termsVersion, termsHash, ...fields } = input;
    const campaign = await store.transaction(async () => {
      const id = randomUUID();
      const record = await store.save('campaigns', {
        ...fields,
        id,
        ownerId: req.account.id,
        shortTitle: fields.title,
        goal: fields.budget.reduce((sum, item) => sum + item.planned, 0),
        budget: fields.budget.map((item) => ({ ...item, id: randomUUID() })),
        status: 'draft',
        verified: false,
        image: '/images/horta.jpg',
        surplusRule: 'Devolução proporcional aos doadores',
        releaseRule: 'Liberação por etapa após análise do comprovante',
        createdAt: new Date().toISOString(),
        acceptedAt: new Date().toISOString(),
        termsVersion: acceptance.version,
        termsHash: acceptance.hash,
        termsDocumentIds: acceptance.documents,
        termsText: acceptance.text,
        simulated: true,
      });
      await store.append(id, { type: 'campaign_created' });
      return record;
    });
    res.status(201).json(publicCampaign(campaign));
  });
  app.post('/api/campaigns/:id/expenses', authenticated, demoOnly, async (req, res) => {
    await requireOwnedCampaign(req, req.params.id);
    res.status(201).json(await store.requestExpense(req.params.id, expenseSchema.parse(req.body)));
  });
  app.post('/api/expenses/:id/decision', admin, demoOnly, async (req, res) => {
    const { approved, reason } = z
      .object({ approved: z.boolean(), reason: text(10, 500) })
      .parse(req.body);
    res.json(await store.decideExpense(req.params.id, approved, reason));
  });
  app.patch('/api/campaigns/:id/status', authenticated, demoOnly, async (req, res) => {
    const { status, reason } = z
      .object({ status: z.enum(['active', 'frozen', 'closed']), reason: text(10, 500) })
      .parse(req.body);
    const result = await store.transaction(async () => {
      const campaign = await requireOwnedCampaign(req, req.params.id);
      if (req.account.role !== 'admin' && !(campaign.status === 'draft' && status === 'active'))
        throw Object.assign(new Error('Esta mudança de estado é reservada à moderação.'), {
          status: 403,
          code: 'FORBIDDEN',
        });
      return store.setStatus(req.params.id, status, reason);
    });
    res.json(publicCampaign(result));
  });
  app.post('/api/reports/:id/decision', admin, demoOnly, async (req, res) => {
    const { reason } = z.object({ reason: text(10, 500) }).parse(req.body);
    res.json(
      await store.transaction(async () => {
        const report = await store.get('reports', req.params.id);
        if (!report || report.status !== 'pending')
          throw new Error('Denúncia não encontrada ou já analisada.');
        return store.save('reports', {
          ...report,
          reasonForDecision: reason,
          status: 'reviewed',
          reviewedAt: new Date().toISOString(),
        });
      }),
    );
  });

  app.post('/api/campaigns/:id/anchors/prepare', authenticated, async (req, res) => {
    const campaign = await requireOwnedCampaign(req, req.params.id);
    if (!campaign.integrity.valid)
      throw new Error('O histórico está inconsistente e não pode ser registrado.');
    const wallet = validateWallet(z.object({ wallet: text(32, 50) }).parse(req.body).wallet);
    if (
      req.account.id &&
      !(await wallets.list(req.account.id)).some(
        (item) => item.network === 'solana' && item.address === wallet,
      )
    )
      return res.status(403).json({
        error:
          'Use a carteira Solana vinculada ao seu perfil. Confira o vínculo em Perfil e carteiras.',
        code: 'WALLET_NOT_LINKED',
      });
    const anchor = {
      id: randomUUID(),
      campaignId: campaign.id,
      count: campaign.integrity.count,
      root: campaign.integrity.root,
      wallet,
      memo: anchorMemo(campaign.id, campaign.integrity.count, campaign.integrity.root),
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
    const blockhash = await getBlockhash(rpcUrl);
    await store.save('anchors', { ...anchor, ...blockhash });
    res.json({ ...anchor, ...blockhash, memoProgram, network: 'devnet' });
  });
  app.post('/api/anchors/:id/submit', authenticated, async (req, res) => {
    const { transaction } = z.object({ transaction: text(50, 3000) }).parse(req.body);
    const anchor = await store.get('anchors', req.params.id);
    if (!anchor || anchor.status !== 'pending')
      throw new Error('Solicitação de registro não encontrada ou já confirmada.');
    await requireOwnedCampaign(req, anchor.campaignId);
    const signature = await submitAnchor(anchor, transaction, rpcUrl);
    await store.transaction(async () => {
      const current = await store.get('anchors', anchor.id);
      if (current.status === 'confirmed') {
        if (current.signature !== signature)
          throw new Error('Este registro já possui outra transação.');
        return;
      }
      await store.save('anchors', { ...current, signature });
    });
    res.json({ signature });
  });
  app.post('/api/anchors/:id/confirm', authenticated, async (req, res) => {
    const { signature } = z
      .object({ signature: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{80,90}$/) })
      .parse(req.body);
    const anchor = await store.get('anchors', req.params.id);
    if (!anchor)
      throw Object.assign(new Error('Solicitação de registro não encontrada.'), {
        status: 404,
        code: 'ANCHOR_NOT_FOUND',
      });
    await requireOwnedCampaign(req, anchor.campaignId);
    if (anchor.status === 'confirmed') {
      if (anchor.signature !== signature)
        throw Object.assign(new Error('Este registro já possui outra transação.'), {
          status: 409,
          code: 'ANCHOR_ALREADY_CONFIRMED',
        });
      return res.json(anchor);
    }
    const prefix = verifyEntries((await store.entries(anchor.campaignId)).slice(0, anchor.count));
    if (!prefix.valid || prefix.root !== anchor.root)
      throw Object.assign(new Error('O histórico não corresponde ao hash solicitado.'), {
        status: 400,
        code: 'ANCHOR_HISTORY_MISMATCH',
      });
    const confirmed = await confirmAnchor(anchor, signature, rpcUrl);
    res.json(
      await store.transaction(async () => {
        const current = await store.get('anchors', anchor.id);
        if (current.status === 'confirmed') {
          if (current.signature !== signature)
            throw Object.assign(new Error('Este registro já possui outra transação.'), {
              status: 409,
              code: 'ANCHOR_ALREADY_CONFIRMED',
            });
          return current;
        }
        return store.save('anchors', { ...current, ...confirmed, status: 'confirmed' });
      }),
    );
  });

  const dist = resolve('dist');
  app.use(express.static(dist));
  app.get('/{*path}', (req, res) => {
    if (req.path.startsWith('/api/'))
      return res.status(404).json({ error: 'Rota não encontrada.' });
    res.sendFile(resolve(dist, 'index.html'));
  });
  app.use((error, req, res, next) => {
    if (error instanceof z.ZodError)
      return res.status(400).json({
        error: 'Confira os campos informados.',
        fields: error.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
        })),
      });
    if (error.type === 'entity.parse.failed')
      return res.status(400).json({ error: 'JSON inválido.' });
    if (error.type === 'entity.too.large')
      return res.status(413).json({ error: 'O conteúdo ultrapassa o limite permitido.' });
    const errorCode = typeof error.code === 'string' ? error.code : undefined;
    if (
      error.name === 'LibsqlError' ||
      errorCode?.startsWith('SERVER_') ||
      errorCode?.startsWith('SQLITE_') ||
      errorCode?.startsWith('ERR_SQLITE')
    ) {
      return res
        .status(503)
        .json({ error: 'Não foi possível acessar o banco. Tente novamente em instantes.' });
    }
    if (error.name === 'SolanaJSONRPCError' || typeof error.code === 'number')
      return res.status(503).json({
        error: 'A Solana devnet está indisponível. Tente novamente em instantes.',
        code: 'RPC_UNAVAILABLE',
      });
    res.status(error.status ?? 400).json({
      error: error.message ?? 'Não foi possível concluir a operação.',
      ...(errorCode ? { code: errorCode } : {}),
    });
  });
  return app;
}
