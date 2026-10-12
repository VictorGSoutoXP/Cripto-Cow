import { randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { digest } from './ledger.js';

const deriveKey = promisify(scrypt);
const parameters = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
export const sessionDuration = 8 * 60 * 60 * 1000;

export function sessionToken(req) {
  return req.headers.cookie
    ?.split(';')
    .map((item) => item.trim())
    .find((item) => item.startsWith('elo_session='))
    ?.slice(12);
}

export function publicUser(row) {
  return { id: row.id, email: row.email, name: row.display_name, role: 'organizer' };
}

async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const key = await deriveKey(password, salt, 64, parameters);
  return `scrypt:${salt}:${key.toString('hex')}`;
}

async function verifyPassword(password, encoded) {
  const [, salt, expected] = encoded.split(':');
  const actual = await deriveKey(password, salt, 64, parameters);
  return timingSafeEqual(actual, Buffer.from(expected, 'hex'));
}

// A missing account still incurs the password derivation cost.
const missingPassword = `scrypt:${'0'.repeat(32)}:${'0'.repeat(128)}`;
const recoveryCode = () => randomBytes(24).toString('hex').match(/.{8}/g).join('-');
const normalizedCode = (value) => value.trim().toLowerCase().replaceAll('-', '');

export class Accounts {
  constructor(store) {
    this.store = store;
  }

  async register({ email, name, password }, acceptance, previousToken) {
    const passwordHash = await hashPassword(password);
    const row = { id: randomUUID(), email, display_name: name };
    return this.store.transaction(async () => {
      const result = await this.store.execute({
        sql: 'INSERT INTO users (id, email, display_name, password_hash, acceptance, created_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(email) DO NOTHING',
        args: [
          row.id,
          email,
          name,
          passwordHash,
          JSON.stringify({ ...acceptance, acceptedAt: new Date().toISOString() }),
          new Date().toISOString(),
        ],
      });
      if (!result.rowsAffected)
        throw Object.assign(new Error('Já existe uma conta com este e-mail. Use a opção Entrar.'), {
          status: 409,
          code: 'ACCOUNT_EXISTS',
        });
      const code = await this.rotateRecovery(row.id);
      const token = await this.issue(row.id, previousToken);
      return { user: publicUser(row), token, recoveryCode: code };
    });
  }

  async login({ email, password }, previousToken) {
    const { rows } = await this.store.execute({
      sql: 'SELECT * FROM users WHERE email = ?',
      args: [email],
    });
    const row = rows[0];
    const valid = await verifyPassword(password, row?.password_hash ?? missingPassword);
    if (!row || !valid)
      throw Object.assign(new Error('E-mail ou senha inválidos.'), {
        status: 401,
        code: 'INVALID_CREDENTIALS',
      });
    const token = await this.store.transaction(() => this.issue(row.id, previousToken));
    return { user: publicUser(row), token };
  }

  async issue(userId, previousToken) {
    const token = randomBytes(32).toString('hex');
    await this.revoke(previousToken);
    await this.store.execute({
      sql: 'DELETE FROM user_sessions WHERE expires_at <= ?',
      args: [Date.now()],
    });
    await this.store.execute({
      sql: 'INSERT INTO user_sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)',
      args: [digest(token), userId, Date.now() + sessionDuration],
    });
    return token;
  }

  async requirePassword(userId, password) {
    const { rows } = await this.store.execute({
      sql: 'SELECT * FROM users WHERE id = ?',
      args: [userId],
    });
    if (!rows[0] || !(await verifyPassword(password, rows[0].password_hash)))
      throw Object.assign(new Error('Confira sua senha atual para confirmar esta alteração.'), {
        status: 400,
        code: 'INVALID_CURRENT_PASSWORD',
      });
    return rows[0];
  }

  async rotateRecovery(userId) {
    const code = recoveryCode();
    await this.store.execute({
      sql: 'INSERT INTO user_recovery VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET secret_hash = excluded.secret_hash',
      args: [userId, digest(normalizedCode(code))],
    });
    return code;
  }

  async recover({ email, code, password }, previousToken) {
    const passwordHash = await hashPassword(password);
    return this.store.transaction(async () => {
      const { rows } = await this.store.execute({
        sql: 'SELECT users.*, user_recovery.secret_hash FROM users JOIN user_recovery ON users.id = user_recovery.user_id WHERE email = ?',
        args: [email],
      });
      const row = rows[0];
      const matches = timingSafeEqual(
        Buffer.from(digest(normalizedCode(code))),
        Buffer.from(row?.secret_hash ?? '0'.repeat(64)),
      );
      if (!row || !matches)
        throw Object.assign(new Error('E-mail ou código de recuperação inválidos.'), {
          status: 400,
          code: 'INVALID_RECOVERY_CODE',
        });
      await this.store.execute({
        sql: 'UPDATE users SET password_hash = ? WHERE id = ?',
        args: [passwordHash, row.id],
      });
      await this.store.execute({
        sql: 'DELETE FROM user_sessions WHERE user_id = ?',
        args: [row.id],
      });
      const newCode = await this.rotateRecovery(row.id);
      const token = await this.issue(row.id, previousToken);
      return { user: publicUser(row), token, recoveryCode: newCode };
    });
  }

  async changePassword(userId, currentPassword, password, previousToken) {
    const passwordHash = await hashPassword(password);
    return this.store.transaction(async () => {
      const row = await this.requirePassword(userId, currentPassword);
      await this.store.execute({
        sql: 'UPDATE users SET password_hash = ? WHERE id = ?',
        args: [passwordHash, userId],
      });
      await this.store.execute({
        sql: 'DELETE FROM user_sessions WHERE user_id = ?',
        args: [userId],
      });
      const code = await this.rotateRecovery(userId);
      const token = await this.issue(userId, previousToken);
      return { user: publicUser(row), token, recoveryCode: code };
    });
  }

  async close(userId, password) {
    return this.store.transaction(async () => {
      await this.requirePassword(userId, password);
      await this.store.execute({ sql: 'DELETE FROM users WHERE id = ?', args: [userId] });
    });
  }

  async current(token) {
    if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
    const { rows } = await this.store.execute({
      sql: 'SELECT users.id, users.email, users.display_name FROM user_sessions JOIN users ON users.id = user_sessions.user_id WHERE token_hash = ? AND expires_at > ?',
      args: [digest(token), Date.now()],
    });
    return rows[0] ? publicUser(rows[0]) : null;
  }

  async revoke(token) {
    if (token)
      await this.store.execute({
        sql: 'DELETE FROM user_sessions WHERE token_hash = ?',
        args: [digest(token)],
      });
  }
}
