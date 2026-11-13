import crypto from 'node:crypto';
import { config } from './config.js';

let key = null;
function getKey() {
  if (!key) {
    if (!/^[0-9a-f]{64}$/i.test(config.encryptionKey)) throw new Error('TOKEN_ENCRYPTION_KEY غير صالح');
    key = Buffer.from(config.encryptionKey, 'hex');
  }
  return key;
}

// AES-256-GCM: الناتج base64(iv | tag | ciphertext)
export function encrypt(plain) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
  const ct = Buffer.concat([c.update(String(plain), 'utf8'), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64');
}
export function decrypt(b64) {
  const buf = Buffer.from(b64, 'base64');
  const d = crypto.createDecipheriv('aes-256-gcm', getKey(), buf.subarray(0, 12));
  d.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString('utf8');
}
export const randomId = (n = 32) => crypto.randomBytes(n).toString('base64url');
export const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
