// تسجيل الدخول بحساب Google + ربط Drive + إدارة الجلسات والصلاحيات
import { config, configProblems, ownerEmailValid } from './config.js';
import { db, now, audit, getSetting, setSetting } from './db.js';
import { randomId, sha256 } from './crypto.js';
import { cookie, parseCookies, AppError } from './http.js';
import { authUrl, exchangeCode, saveDriveTokens } from './google.js';

const secure = config.appUrl.startsWith('https://');
const SID = secure ? '__Host-sjl_sid' : 'sjl_sid';

export function roleFor(email) {
  email = (email || '').toLowerCase();
  if (!email) return null;
  if (ownerEmailValid() ? email === config.ownerEmail : email === getSetting('claimed_owner')) return 'owner';
  if (config.viewerEmails.includes(email)) return 'viewer';
  const u = db.prepare("SELECT role FROM users WHERE email = ? AND role = 'viewer'").get(email);
  return u ? 'viewer' : null;
}

export function getSession(req) {
  const sid = parseCookies(req)[SID];
  if (!sid) return null;
  const s = db.prepare('SELECT * FROM sessions WHERE id_hash = ? AND expires_at > ?').get(sha256(sid), now());
  if (!s) return null;
  // إعادة التحقق من الصلاحية في كل طلب (لو أُزيلت مطّلعة من القائمة تنتهي جلستها فورًا)
  const role = roleFor(s.email);
  if (!role) { db.prepare('DELETE FROM sessions WHERE id_hash = ?').run(s.id_hash); return null; }
  return { email: s.email, name: s.name, picture: s.picture, role };
}

function redirect(res, location, cookies = []) {
  res.writeHead(302, { Location: location, 'Set-Cookie': cookies, 'Cache-Control': 'no-store' });
  res.end();
}

export async function handleAuth(req, res, url) {
  const p = url.pathname;
  if (p === '/auth/login' || p === '/auth/connect-drive') {
    const problems = configProblems();
    if (problems.length) return redirect(res, `/#/login?error=${encodeURIComponent('إعداد الخادم غير مكتمل: ' + problems.join('، '))}`);
    const purpose = p === '/auth/connect-drive' ? 'drive' : 'login';
    const state = randomId(24);
    db.prepare('INSERT INTO oauth_states (state, purpose, created_at) VALUES (?, ?, ?)').run(state, purpose, now());
    return redirect(res, authUrl(state, purpose), [cookie('sjl_oauth', state, { maxAge: 900, secure })]);
  }

  if (p === '/auth/callback') {
    const fail = (msg) => redirect(res, `/#/login?error=${encodeURIComponent(msg)}`, [cookie('sjl_oauth', '', { maxAge: 0, secure })]);
    const state = url.searchParams.get('state') || '';
    const st = db.prepare('SELECT * FROM oauth_states WHERE state = ?').get(state);
    db.prepare('DELETE FROM oauth_states WHERE state = ?').run(state);
    if (!st || parseCookies(req).sjl_oauth !== state || now() - st.created_at > 15 * 60 * 1000) return fail('انتهت مهلة تسجيل الدخول أو الطلب غير صالح، حاولي مرة أخرى');
    if (url.searchParams.get('error')) return fail('تم إلغاء تسجيل الدخول أو رفض الصلاحيات');
    try {
      const { tokens, profile } = await exchangeCode(url.searchParams.get('code') || '');
      let role = roleFor(profile.email);
      // إن لم يُضبط OWNER_EMAIL ببريد صالح: أول من يسجّل الدخول (ويجب أن يكون مستخدم اختبار مسموحًا في Google) يصبح المالكة
      if (!role && !ownerEmailValid() && !getSetting('claimed_owner')) {
        setSetting('claimed_owner', profile.email); role = 'owner'; audit(profile.email, 'auth.owner_claimed');
      }
      if (!role) { audit(profile.email, 'auth.denied'); return fail(`الحساب ${profile.email} غير مصرّح له بالدخول إلى المنصة`); }
      if (st.purpose === 'drive') {
        if (role !== 'owner') return fail('ربط Google Drive متاح لصاحبة المنصة فقط');
        saveDriveTokens(profile.email, tokens);
        audit(profile.email, 'drive.connected');
      }
      db.prepare(`INSERT INTO users (email, name, role, last_login, created_at) VALUES (?, ?, ?, ?, ?)
                  ON CONFLICT(email) DO UPDATE SET name = excluded.name, last_login = excluded.last_login`)
        .run(profile.email, profile.name, role, now(), now());
      const sid = randomId(32);
      db.prepare('INSERT INTO sessions (id_hash, email, role, name, picture, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(sha256(sid), profile.email, role, profile.name, profile.picture, now(), now() + config.sessionDays * 864e5);
      audit(profile.email, 'auth.login', role);
      return redirect(res, st.purpose === 'drive' ? '/#/settings?connected=1' : '/#/', [
        cookie(SID, sid, { maxAge: config.sessionDays * 86400, secure }),
        cookie('sjl_oauth', '', { maxAge: 0, secure }),
      ]);
    } catch (e) {
      console.error('[auth]', e.message);
      return fail(e instanceof AppError ? e.message : 'حدث خطأ أثناء تسجيل الدخول');
    }
  }

  if (p === '/auth/logout' && req.method === 'POST') {
    const sid = parseCookies(req)[SID];
    if (sid) db.prepare('DELETE FROM sessions WHERE id_hash = ?').run(sha256(sid));
    res.writeHead(204, { 'Set-Cookie': cookie(SID, '', { maxAge: 0, secure }) });
    return res.end();
  }
  res.writeHead(404); res.end();
}
