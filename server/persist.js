// حفظ حالة المنصة خارج الخادم (Upstash Redis — خطة مجانية) لتعمل على استضافة بلا قرص دائم.
// يُحفظ: الإعدادات، ربط الأقسام، المستخدمون، الجلسات، رموز Google (مشفّرة)، جلسات الرفع، آخر السجلات.
// فهرس الملفات لا يُحفظ لأنه يُعاد بناؤه تلقائيًا من Google Drive بالمزامنة.
// الحالة كاملة تُشفّر AES-256-GCM بمفتاح TOKEN_ENCRYPTION_KEY قبل إرسالها.
import { db, tx } from './db.js';
import { encrypt, decrypt } from './crypto.js';

const URL_ = (process.env.UPSTASH_REDIS_REST_URL || '').replace(/\/+$/, '');
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || '';
const KEY = 'sijil-shawahid-state-v1';
export const persistEnabled = () => !!(URL_ && TOKEN);
let ready = false; // لا نرفع أي حالة قبل التأكد من استعادة الحالة السابقة، حتى لا نمسحها بحالة فارغة

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
  if (!persistEnabled()) return false;
  let raw;
  for (let i = 0; ; i++) {
    try { raw = await redis(['GET', KEY]); break; } catch (e) {
      if (i >= 3) { console.error('[persist] تعذر الوصول إلى Upstash، الحفظ الخارجي متوقف لهذا التشغيل:', e.message); return false; }
      await new Promise((r) => setTimeout(r, 1000 * 2 ** i));
    }
  }
  if (!raw) { ready = true; console.log('[persist] لا توجد حالة محفوظة بعد (تشغيل أول)'); return false; }
  const s = JSON.parse(decrypt(raw));
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
    try { await redis(['SET', KEY, encrypt(JSON.stringify(snapshot()))]); } catch (e) { console.error('[persist] تعذر الحفظ:', e.message); dirty = true; }
  })().finally(() => { pushing = null; if (dirty) { dirty = false; schedulePush(); } });
  return pushing;
}
export function schedulePush() {
  if (!persistEnabled() || !ready) return;
  clearTimeout(timer);
  timer = setTimeout(push, 1500);
}
export async function flushNow() {
  if (!persistEnabled() || !ready) return;
  clearTimeout(timer);
  await push();
}
