import { createHash, timingSafeEqual } from 'node:crypto';
import bs58 from 'bs58';
import { secp256k1 } from '@noble/curves/secp256k1';

const sha256 = (bytes) => createHash('sha256').update(bytes).digest();
const doubleSha256 = (bytes) => sha256(sha256(bytes));

function compactSize(length) {
  if (length < 253) return Buffer.from([length]);
  const bytes = Buffer.alloc(3);
  bytes[0] = 253;
  bytes.writeUInt16LE(length, 1);
  return bytes;
}

export function zcashMessageHash(message) {
  const magic = Buffer.from('Zcash Signed Message:\n');
  const bytes = Buffer.from(message, 'utf8');
  if (bytes.length > 65535) throw new Error('Mensagem muito longa.');
  return doubleSha256(
    Buffer.concat([compactSize(magic.length), magic, compactSize(bytes.length), bytes]),
  );
}

export function validateZcashAddress(address) {
  try {
    const decoded = Buffer.from(bs58.decode(address));
    if (
      decoded.length !== 26 ||
      decoded[0] !== 0x1d ||
      decoded[1] !== 0x25 ||
      !timingSafeEqual(decoded.subarray(22), doubleSha256(decoded.subarray(0, 22)).subarray(0, 4))
    )
      throw new Error();
    return address;
  } catch {
    throw Object.assign(
      new Error(
        'Use um endereço transparente Zcash testnet válido, iniciado por tm. Endereços mainnet e protegidos não são aceitos neste vínculo.',
      ),
      { status: 400, code: 'INVALID_ZCASH_ADDRESS' },
    );
  }
}

export function verifyZcashMessage(address, message, encodedSignature) {
  validateZcashAddress(address);
  try {
    const bytes = Buffer.from(encodedSignature, 'base64');
    if (
      bytes.length !== 65 ||
      bytes.toString('base64') !== encodedSignature ||
      bytes[0] < 27 ||
      bytes[0] > 34
    )
      return false;
    const header = bytes[0] - 27;
    const signature = secp256k1.Signature.fromCompact(bytes.subarray(1)).addRecoveryBit(header & 3);
    const publicKey = signature
      .recoverPublicKey(zcashMessageHash(message))
      .toRawBytes(Boolean(header & 4));
    const keyHash = createHash('ripemd160').update(sha256(publicKey)).digest();
    return timingSafeEqual(keyHash, Buffer.from(bs58.decode(address)).subarray(2, 22));
  } catch {
    return false;
  }
}

export function zcashPaymentRequest(address, amount) {
  validateZcashAddress(address);
  if (
    !/^(?:0|[1-9]\d{0,7})(?:\.\d{1,8})?$/.test(amount) ||
    Number(amount) <= 0 ||
    Number(amount) > 21000000
  )
    throw Object.assign(
      new Error('Informe um valor em ZEC de teste com até oito casas decimais.'),
      { status: 400 },
    );
  return `zcash:${address}?amount=${amount}&label=Cripto%20Cow%20testnet`;
}
