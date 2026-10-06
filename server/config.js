export function readConfig(env = process.env) {
  const render = env.RENDER === 'true';
  const production = env.NODE_ENV === 'production';
  const host = env.HOST || (render ? '0.0.0.0' : '127.0.0.1');
  const port = Number(env.PORT || 3001);
  const url = env.TURSO_DATABASE_URL?.trim() || undefined;
  const authToken = env.TURSO_AUTH_TOKEN?.trim() || undefined;
  const password = env.ADMIN_PASSWORD;

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT deve ser um número entre 1 e 65535.');
  }
  if (Boolean(url) !== Boolean(authToken)) {
    throw new Error('Configure TURSO_DATABASE_URL e TURSO_AUTH_TOKEN juntos.');
  }
  if (url) {
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error('TURSO_DATABASE_URL deve ser uma URL válida do banco.');
    }
    if (
      !['libsql:', 'https:'].includes(parsed.protocol) ||
      !parsed.hostname ||
      parsed.username ||
      parsed.password
    ) {
      throw new Error(
        'TURSO_DATABASE_URL deve usar libsql:// ou https://, sem credenciais na URL.',
      );
    }
  }
  if (render && !url) {
    throw new Error(
      'No Render, configure o Turso. O banco local não é persistente no plano gratuito.',
    );
  }
  const exposed = !['127.0.0.1', 'localhost', '::1'].includes(host);
  if (
    (render || production || exposed) &&
    (!password || password.length < 16 || password.length > 200)
  ) {
    throw new Error('Configure ADMIN_PASSWORD com 16 a 200 caracteres para acesso hospedado.');
  }
  const demo = env.DEMO_MODE !== 'false';
  return {
    host,
    port,
    demo,
    password,
    production,
    trustProxy: render ? 1 : false,
    rpcUrl: env.SOLANA_RPC_URL || 'https://api.devnet.solana.com',
    database: {
      path: env.DATABASE_PATH || './data/elo.sqlite',
      url,
      authToken,
      seed: demo && env.SEED_DEMO !== 'false',
    },
  };
}
