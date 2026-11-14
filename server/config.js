// تحميل الإعدادات من متغيرات البيئة (مع دعم ملف .env محلي بدون مكتبات خارجية)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function loadDotEnv() {
  const file = path.join(ROOT, '.env');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || line.trim().startsWith('#')) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
}
loadDotEnv();

const env = Object.fromEntries(Object.entries(process.env).map(([k, v]) => [k, typeof v === 'string' ? v.replace(/[​-‏‪-‮⁦-⁩﻿ ]/g, '').trim() : v])); // إزالة المسافات الزائدة الناتجة عن النسخ واللصق
const list = (s) => (s || '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);

export const config = {
  appUrl: (env.APP_URL || `http://localhost:${env.PORT || 3000}`).replace(/\/+$/, ''),
  port: Number(env.PORT || 3000),
  clientId: env.GOOGLE_CLIENT_ID || '',
  clientSecret: env.GOOGLE_CLIENT_SECRET || '',
  ownerEmail: (env.OWNER_EMAIL || '').trim().toLowerCase(),
  viewerEmails: list(env.VIEWER_EMAILS),
  encryptionKey: ((env.TOKEN_ENCRYPTION_KEY || '').replace(/\s+/g, '').match(/[0-9a-f]{64}/i) || [(env.TOKEN_ENCRYPTION_KEY || '').replace(/\s+/g, '')])[0],
  encryptionKeyLength: (env.TOKEN_ENCRYPTION_KEY || '').replace(/\s+/g, '').length,
  dbPath: path.resolve(ROOT, env.DATABASE_PATH || './data/shawahid.db'),
  anthropicKey: env.ANTHROPIC_API_KEY || '',
  anthropicModel: env.ANTHROPIC_MODEL || 'claude-sonnet-5-5',
  // يمكن تغييرها فقط لأغراض الاختبار الآلي (محاكي Google في مجلد tests)
  googleAuthUrl: env.GOOGLE_AUTH_URL || 'https://accounts.google.com/o/oauth2/v2/auth',
  googleTokenUrl: env.GOOGLE_TOKEN_URL || 'https://oauth2.googleapis.com/token',
  googleRevokeUrl: env.GOOGLE_REVOKE_URL || 'https://oauth2.googleapis.com/revoke',
  googleApiBase: (env.GOOGLE_API_BASE || 'https://www.googleapis.com').replace(/\/+$/, ''),
  anthropicUrl: env.ANTHROPIC_URL || 'https://api.anthropic.com/v1/messages',
  // الصلاحيات: هوية المستخدم + Drive. انظري docs/GOOGLE_SETUP.md لسبب اختيار نطاق drive.
  loginScopes: ['openid', 'email', 'profile'],
  driveScopes: ['openid', 'email', 'profile', 'https://www.googleapis.com/auth/drive'],
  sessionDays: 30,
  uploadChunkMax: 32 * 1024 * 1024,
};

export function configProblems() {
  const p = [];
  if (!config.clientId) p.push('GOOGLE_CLIENT_ID غير مضبوط');
  if (!config.clientSecret) p.push('GOOGLE_CLIENT_SECRET غير مضبوط');
  if (!config.ownerEmail) p.push('OWNER_EMAIL غير مضبوط');
  if (!/^[0-9a-f]{64}$/i.test(config.encryptionKey) && !config.clientSecret) p.push('TOKEN_ENCRYPTION_KEY يجب أن يكون 64 حرفًا hex (npm run gen-key)');
  return p;
}
