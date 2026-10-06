import express from 'express';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { resolve } from 'node:path';
import { z } from 'zod';
import { digest, verifyEntries } from './ledger.js';
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
  accepted: z.literal(true),
});
const expenseSchema = z.object({
  title: text(5, 100),
  supplier: text(3, 80),
  categoryId: text(1, 80),
  amount: money,
  evidenceSummary: text(30, 1500),
});

export function createApp(store, options = {}) {
  const app = express();
  const demo = options.demo ?? process.env.DEMO_MODE !== 'false';
  const password = options.password ?? process.env.ADMIN_PASSWORD;
  const rpcUrl = options.rpcUrl ?? process.env.SOLANA_RPC_URL ?? 'https://api.devnet.solana.com';
  const production = options.production ?? process.env.NODE_ENV === 'production';
  const sessions = new Map();
  const rate = new Map();
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

  const admin = (req, res, next) => {
    const token = req.headers.cookie
      ?.split(';')
      .map((item) => item.trim())
      .find((item) => item.startsWith('elo_session='))
      ?.slice(12);
    const session = sessions.get(token);
    if (!session || session.expires < Date.now())
      return res.status(401).json({ error: 'Entre no painel para continuar.' });
    next();
  };
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
          const { ledger, expenses, ...campaign } = await store.campaign(item.id);
          return campaign;
        }),
    );
    res.json({ campaigns, demo });
  });
  app.get('/api/campaigns/:id', async (req, res) => {
    const campaign = await requireCampaign(req.params.id);
    if (campaign.status === 'draft')
      return res.status(404).json({ error: 'Esta campanha ainda não foi publicada.' });
    res.json(campaign);
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
      .object({ amount: money.max(1000000), requestKey: z.uuid(), accepted: z.literal(true) })
      .parse(req.body);
    res
      .status(201)
      .json(await store.donate(req.params.id, input.amount, input.requestKey, input.accepted));
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

  app.post('/api/admin/session', (req, res) => {
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
    const token = randomBytes(32).toString('hex');
    sessions.set(token, { expires: Date.now() + 8 * 60 * 60 * 1000 });
    res.cookie('elo_session', token, {
      httpOnly: true,
      sameSite: 'strict',
      secure: production || req.secure,
      maxAge: 8 * 60 * 60 * 1000,
    });
    res.json({ authenticated: true, demo });
  });
  app.delete('/api/admin/session', (req, res) => {
    const token = req.headers.cookie
      ?.split(';')
      .map((item) => item.trim())
      .find((item) => item.startsWith('elo_session='))
      ?.slice(12);
    sessions.delete(token);
    res.clearCookie('elo_session');
    res.json({ authenticated: false });
  });
  app.get('/api/admin', admin, async (req, res) => {
    const [records, reports] = await Promise.all([store.list('campaigns'), store.list('reports')]);
    const campaigns = await Promise.all(records.map((item) => store.campaign(item.id)));
    res.json({ campaigns, reports, demo });
  });
  app.post('/api/campaigns', admin, demoOnly, async (req, res) => {
    const input = campaignSchema.parse(req.body);
    if (new Date(`${input.deadline}T23:59:59-03:00`) <= new Date())
      throw new Error('Escolha uma data de encerramento no futuro.');
    const { accepted, ...fields } = input;
    const campaign = await store.transaction(async () => {
      const id = randomUUID();
      const record = await store.save('campaigns', {
        ...fields,
        id,
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
        termsVersion: 'demo-1.0',
        simulated: true,
      });
      await store.append(id, { type: 'campaign_created' });
      return record;
    });
    res.status(201).json(campaign);
  });
  app.post('/api/campaigns/:id/expenses', admin, demoOnly, async (req, res) =>
    res.status(201).json(await store.requestExpense(req.params.id, expenseSchema.parse(req.body))),
  );
  app.post('/api/expenses/:id/decision', admin, demoOnly, async (req, res) => {
    const { approved, reason } = z
      .object({ approved: z.boolean(), reason: text(10, 500) })
      .parse(req.body);
    res.json(await store.decideExpense(req.params.id, approved, reason));
  });
  app.patch('/api/campaigns/:id/status', admin, demoOnly, async (req, res) => {
    const { status, reason } = z
      .object({ status: z.enum(['active', 'frozen', 'closed']), reason: text(10, 500) })
      .parse(req.body);
    res.json(await store.setStatus(req.params.id, status, reason));
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

  app.post('/api/campaigns/:id/anchors/prepare', admin, async (req, res) => {
    const campaign = await requireCampaign(req.params.id);
    if (!campaign.integrity.valid)
      throw new Error('O histórico está inconsistente e não pode ser registrado.');
    const wallet = validateWallet(z.object({ wallet: text(32, 50) }).parse(req.body).wallet);
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
  app.post('/api/anchors/:id/submit', admin, async (req, res) => {
    const { transaction } = z.object({ transaction: text(50, 3000) }).parse(req.body);
    const anchor = await store.get('anchors', req.params.id);
    if (!anchor || anchor.status !== 'pending')
      throw new Error('Solicitação de registro não encontrada ou já confirmada.');
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
  app.post('/api/anchors/:id/confirm', admin, async (req, res) => {
    const { signature } = z
      .object({ signature: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{80,90}$/) })
      .parse(req.body);
    const anchor = await store.get('anchors', req.params.id);
    if (!anchor) throw new Error('Solicitação de registro não encontrada.');
    if (anchor.status === 'confirmed') {
      if (anchor.signature !== signature)
        throw new Error('Este registro já possui outra transação.');
      return res.json(anchor);
    }
    const prefix = verifyEntries((await store.entries(anchor.campaignId)).slice(0, anchor.count));
    if (!prefix.valid || prefix.root !== anchor.root)
      throw new Error('O histórico não corresponde ao hash solicitado.');
    const confirmed = await confirmAnchor(anchor, signature, rpcUrl);
    res.json(
      await store.transaction(async () => {
        const current = await store.get('anchors', anchor.id);
        if (current.status === 'confirmed') {
          if (current.signature !== signature)
            throw new Error('Este registro já possui outra transação.');
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
    if (
      error.name === 'LibsqlError' ||
      error.code?.startsWith('SERVER_') ||
      error.code?.startsWith('SQLITE_') ||
      error.code?.startsWith('ERR_SQLITE')
    ) {
      return res
        .status(503)
        .json({ error: 'Não foi possível acessar o banco. Tente novamente em instantes.' });
    }
    res
      .status(error.status ?? 400)
      .json({ error: error.message ?? 'Não foi possível concluir a operação.' });
  });
  return app;
}
