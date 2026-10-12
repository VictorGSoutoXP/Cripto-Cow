import { createPublicKey, randomBytes, randomUUID, verify } from 'node:crypto';
import bs58 from 'bs58';
import { PublicKey } from '@solana/web3.js';
import { validateZcashAddress, verifyZcashMessage } from './zcash.js';

function validateAddress(network, address) {
  if (network === 'zcash') return validateZcashAddress(address);
  try {
    const key = new PublicKey(address);
    if (!PublicKey.isOnCurve(key.toBytes())) throw new Error();
    return key.toBase58();
  } catch {
    throw Object.assign(
      new Error('Informe o endereço de uma carteira Solana que possa assinar mensagens.'),
      { status: 400, code: 'INVALID_SOLANA_ADDRESS' },
    );
  }
}

function verifySolanaMessage(address, message, signature) {
  try {
    const bytes = Buffer.from(signature, 'base64');
    if (bytes.length !== 64 || bytes.toString('base64') !== signature) return false;
    const key = createPublicKey({
      key: Buffer.concat([
        Buffer.from('302a300506032b6570032100', 'hex'),
        Buffer.from(bs58.decode(address)),
      ]),
      format: 'der',
      type: 'spki',
    });
    return verify(null, Buffer.from(message, 'utf8'), key, bytes);
  } catch {
    return false;
  }
}

export class ProfileWallets {
  constructor(store) {
    this.store = store;
  }

  async list(userId) {
    const { rows } = await this.store.execute({
      sql: 'SELECT id, network, address, verified_at FROM profile_wallets WHERE user_id = ? ORDER BY network',
      args: [userId],
    });
    return rows.map((row) => ({
      id: row.id,
      network: row.network,
      address: row.address,
      verifiedAt: row.verified_at,
      chain: row.network === 'solana' ? 'devnet' : 'testnet',
    }));
  }

  async prepare(userId, network, inputAddress, origin) {
    const address = validateAddress(network, inputAddress);
    const id = randomUUID();
    const expires = Date.now() + 5 * 60 * 1000;
    const message = `Cripto Cow | Vincular carteira\nSite: ${origin}\nPerfil: ${userId}\nRede: ${network === 'solana' ? 'Solana devnet' : 'Zcash testnet'}\nEndereco: ${address}\nDesafio: ${id}\nNonce: ${randomBytes(16).toString('hex')}\nValidade: ${new Date(expires).toISOString()}\nEsta assinatura vincula o endereco ao perfil. Nao autoriza pagamentos.`;
    await this.store.transaction(async () => {
      await this.store.execute({
        sql: 'DELETE FROM wallet_challenges WHERE expires_at <= ? OR (user_id = ? AND network = ?)',
        args: [Date.now(), userId, network],
      });
      await this.store.execute({
        sql: 'INSERT INTO wallet_challenges VALUES (?, ?, ?, ?, ?, ?)',
        args: [id, userId, network, address, message, expires],
      });
    });
    return { id, network, address, message, expiresAt: new Date(expires).toISOString() };
  }

  async confirm(userId, id, signature) {
    return this.store.transaction(async () => {
      const { rows } = await this.store.execute({
        sql: 'SELECT * FROM wallet_challenges WHERE id = ? AND user_id = ?',
        args: [id, userId],
      });
      const challenge = rows[0];
      if (!challenge || challenge.expires_at <= Date.now())
        throw Object.assign(
          new Error('O desafio expirou ou já foi usado. Prepare um novo vínculo.'),
          { status: 409, code: 'WALLET_CHALLENGE_EXPIRED' },
        );
      const valid =
        challenge.network === 'solana'
          ? verifySolanaMessage(challenge.address, challenge.message, signature)
          : verifyZcashMessage(challenge.address, challenge.message, signature);
      if (!valid)
        throw Object.assign(new Error('A assinatura não comprova a posse deste endereço.'), {
          status: 400,
          code: 'INVALID_WALLET_SIGNATURE',
        });
      const existing = await this.store.execute({
        sql: 'SELECT user_id FROM profile_wallets WHERE network = ? AND address = ?',
        args: [challenge.network, challenge.address],
      });
      if (existing.rows[0] && existing.rows[0].user_id !== userId)
        throw Object.assign(new Error('Esta carteira já está vinculada a outro perfil.'), {
          status: 409,
          code: 'WALLET_IN_USE',
        });
      await this.store.execute({
        sql: 'INSERT INTO profile_wallets VALUES (?, ?, ?, ?, ?) ON CONFLICT(user_id, network) DO UPDATE SET address = excluded.address, verified_at = excluded.verified_at',
        args: [
          randomUUID(),
          userId,
          challenge.network,
          challenge.address,
          new Date().toISOString(),
        ],
      });
      await this.store.execute({ sql: 'DELETE FROM wallet_challenges WHERE id = ?', args: [id] });
      return this.list(userId);
    });
  }

  async remove(userId, network) {
    await this.store.batch([
      {
        sql: 'DELETE FROM wallet_challenges WHERE user_id = ? AND network = ?',
        args: [userId, network],
      },
      {
        sql: 'DELETE FROM profile_wallets WHERE user_id = ? AND network = ?',
        args: [userId, network],
      },
    ]);
  }
}
