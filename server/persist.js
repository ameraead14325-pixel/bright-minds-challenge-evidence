// حفظ حالة المنصة خارج الخادم (Upstash Redis — خطة مجانية) لتعمل على استضافة بلا قرص دائم.
// يُحفظ: الإعدادات، ربط الأقسام، المستخدمون، الجلسات، رموز Google (مشفّرة)، جلسات الرفع، آخر السجلات.
// فهرس الملفات لا يُحفظ لأنه يُعاد بناؤه تلقائيًا من Google Drive بالمزامنة.
// الحالة كاملة تُشفّر AES-256-GCM بمفتاح TOKEN_ENCRYPTION_KEY قبل إرسالها.
import { db, tx } from './db.js';
import { encrypt, decrypt } from './crypto.js';

const clean = (v) => (v || '').replace(/[​-‏‪-‮⁦-⁩﻿ ]/g, '').trim().replace(/^["']|["']$/g, '');
// استخراج مرن لعنوان Upstash والتوكن مهما كانت صيغة اللصق (رابط، مضيف فقط، سطور ‎.env، أو خانتان معكوستان)
const RAW_URL = clean(process.env.UPSTASH_REDIS_REST_URL);
const RAW_TOKEN = clean(process.env.UPSTASH_REDIS_REST_TOKEN);
function extract() {
  const all = `${RAW_URL}\n${RAW_TOKEN}`;
  const hostM = all.match(/([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.upstash\.io)/);
  const url = hostM ? `https://${hostM[1]}` : (/^https?:\/\/\S+$/.test(RAW_URL) && !/onrender\.com/i.test(RAW_URL) ? RAW_URL.replace(/\/+$/, '') : '');
  const named = all.match(/UPSTASH_REDIS_REST_TOKEN\s*[=:]\s*["']?([A-Za-z0-9_=+\/-]{20,})/);
  if (named) return { url, token: named[1] };
  const candidates = [RAW_TOKEN, RAW_URL].filter((v) => v && !/upstash\.io|https?:\/\//i.test(v)).map((v) => v.replace(/^[A-Z_]+\s*[=:]\s*/, '').replace(/["'\s]/g, ''));
  const token = candidates.sort((a, b) => b.length - a.length)[0] || '';
  return { url, token };
}
let { url: URL_, token: TOKEN } = extract();
const KEY = 'sijil-shawahid-state-v1';
export const persistEnabled = () => !!(RAW_URL || RAW_TOKEN);
const usable = () => !!(URL_ && TOKEN);
let ready = false; let lastError = null;
const shape = (v) => !v ? 'empty' : /^https:\/\/[^/]+\.upstash\.io$/.test(v) ? 'upstash-url' : /^https?:\/\//i.test(v) ? 'other-url:' + (v.match(/^https?:\/\/([^/]+)/) || [])[1] : /^[0-9a-f]{64}$/i.test(v) ? 'looks-like-encryption-key' : 'text(' + v.length + ')';
const flags = (v) => ({ len: v.length, https: /https?:\/\//i.test(v), upstashHost: /upstash\.io/i.test(v), onrender: /onrender\.com/i.test(v), equals: v.includes('='), quote: /["']/.test(v), space: /\s/.test(v) });
export const persistDiag = () => ({ urlField: flags(RAW_URL), tokenField: flags(RAW_TOKEN), foundUrl: !!URL_, foundTokenLen: TOKEN.length });
export const persistStatus = () => !persistEnabled() ? 'not-configured' : !URL_ ? 'bad-url' : !TOKEN ? 'no-token' : lastError ? 'error' : ready ? 'ok' : 'starting'; // لا نرفع أي حالة قبل التأكد من استعادة الحالة السابقة، حتى لا نمسحها بحالة فارغة

const TABLES = {
  settings: 'SELECT * FROM settings',
  sections: 'SELECT key, folder_id, folder_name, target_count FROM sections',
  users: 'SELECT * FROM users',
  sessions: 'SELECT * FROM sessions WHERE expires_at > ?',
  google_tokens: 'SELECT * FROM google_tokens',
  uploads: 'SELECT * FROM uploads',
  audit_log: 'SELECT * FROM audit_log ORDER BY id DESC LIMIT 400',
};

async function redis(cmd) {
  const r = await fetch(URL_, { signal: AbortSignal.timeout(8000), method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify(cmd) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(`Upstash: ${j.error || r.status}`);
  return j.result;
}

function snapshot() {
  const out = { v: 1, at: Date.now() };
  for (const [t, sql] of Object.entries(TABLES)) out[t] = t === 'sessions' ? db.prepare(sql).all(Date.now()) : db.prepare(sql).all();
  return out;
}

function insertRows(table, rows) {
  for (const row of rows) {
    const cols = Object.keys(row);
    db.prepare(`INSERT OR REPLACE INTO ${table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`).run(...cols.map((c) => row[c]));
  }
}

export async function restoreState() {
  if (!usable()) return false;
  let raw;
  for (let i = 0; ; i++) {
    try { raw = await redis(['GET', KEY]); break; } catch (e) {
      if (i >= 3) { lastError = e.message; console.error('[persist] تعذر الوصول إلى Upstash، الحفظ الخارجي متوقف لهذا التشغيل:', e.message); return false; }
      await new Promise((r) => setTimeout(r, 1000 * 2 ** i));
    }
  }
  if (!raw) { ready = true; console.log('[persist] لا توجد حالة محفوظة بعد (تشغيل أول)'); return false; }
  let s;
  try { s = JSON.parse(decrypt(raw)); } catch (e) {
    ready = true; console.error('[persist] تعذر فك الحالة المحفوظة (تغيّر مفتاح التشفير؟) — ستبدأ المنصة بحالة جديدة'); return false;
  }
  tx(() => {
    for (const t of ['settings', 'users', 'sessions', 'google_tokens', 'uploads', 'audit_log']) { db.prepare(`DELETE FROM ${t}`).run(); insertRows(t, s[t] || []); }
    db.prepare('DELETE FROM files').run();
    for (const sec of s.sections || []) db.prepare('UPDATE sections SET folder_id = ?, folder_name = ?, target_count = ?, last_sync = NULL WHERE key = ?').run(sec.folder_id, sec.folder_name, sec.target_count, sec.key);
    db.prepare("DELETE FROM settings WHERE key = 'last_sync_all'").run();
  });
  ready = true;
  console.log(`[persist] استُعيدت حالة المنصة المحفوظة بتاريخ ${new Date(s.at).toISOString()}`);
  return true;
}

let timer = null; let pushing = null; let dirty = false;
async function push() {
  if (pushing) { dirty = true; return pushing; }
  pushing = (async () => {
    try { await redis(['SET', KEY, encrypt(JSON.stringify(snapshot()))]); lastError = null; } catch (e) { lastError = e.message; console.error('[persist] تعذر الحفظ:', e.message); dirty = true; }
  })().finally(() => { pushing = null; if (dirty) { dirty = false; schedulePush(); } });
  return pushing;
}
export function schedulePush() {
  if (!usable() || !ready) return;
  clearTimeout(timer);
  timer = setTimeout(push, 1500);
}
export async function flushNow() {
  if (!usable() || !ready) return;
  clearTimeout(timer);
  await push();
}
