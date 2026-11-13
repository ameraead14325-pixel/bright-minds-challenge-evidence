// اختبار شامل لمسارات المنصة الحقيقية (الخادم + قاعدة البيانات) مقابل محاكي Google
// تشغيل: npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { startEmulator } from './google-emulator.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const TMP = path.join(ROOT, 'tests', '.tmp');
const DB = path.join(TMP, `e2e-${Date.now()}.db`);
const PORT = 3900 + Math.floor(Math.random() * 90);
const APP = `http://localhost:${PORT}`;
const OWNER = 'owner@test.example';
const VIEWER = 'principal@test.example';
let emu; let proc;

function startServer() {
  return new Promise((resolve, reject) => {
    proc = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server/index.js'], {
      cwd: ROOT,
      env: {
        ...process.env, PORT: String(PORT), APP_URL: APP, DATABASE_PATH: DB, GOOGLE_CLIENT_ID: 'test-client', GOOGLE_CLIENT_SECRET: 'test-secret',
        OWNER_EMAIL: OWNER, VIEWER_EMAILS: VIEWER, TOKEN_ENCRYPTION_KEY: 'ab'.repeat(32),
        GOOGLE_AUTH_URL: `${emu.base}/auth`, GOOGLE_TOKEN_URL: `${emu.base}/token`, GOOGLE_REVOKE_URL: `${emu.base}/revoke`, GOOGLE_API_BASE: emu.base,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    proc.stdout.on('data', (d) => { if (String(d).includes('تعمل على')) resolve(); });
    proc.stderr.on('data', (d) => process.stderr.write(d));
    proc.on('exit', (c) => c && reject(new Error('server exited ' + c)));
  });
}
const stopServer = () => new Promise((r) => { proc.once('exit', r); proc.kill('SIGTERM'); });

async function login(purpose, email) {
  const r1 = await fetch(`${APP}/auth/${purpose === 'drive' ? 'connect-drive' : 'login'}`, { redirect: 'manual' });
  assert.equal(r1.status, 302);
  const loc = new URL(r1.headers.get('location'));
  assert.equal(loc.origin + loc.pathname, `${emu.base}/auth`);
  const state = loc.searchParams.get('state');
  const oc = r1.headers.getSetCookie().find((c) => c.startsWith('sjl_oauth=')).split(';')[0];
  const r2 = await fetch(`${APP}/auth/callback?state=${state}&code=${purpose}:${email}`, { redirect: 'manual', headers: { cookie: oc } });
  assert.equal(r2.status, 302);
  const sid = r2.headers.getSetCookie().find((c) => c.startsWith('sjl_sid='));
  return { location: r2.headers.get('location'), cookie: sid ? sid.split(';')[0] : null };
}

function client(cookie) {
  return async (method, p, body, headers = {}) => {
    const h = { cookie, 'x-requested-with': 'sjl', ...headers };
    let b = body;
    if (body && !(body instanceof Uint8Array)) { h['content-type'] = 'application/json'; b = JSON.stringify(body); }
    const r = await fetch(APP + p, { method, headers: h, body: b });
    const ct = r.headers.get('content-type') || '';
    return { status: r.status, headers: r.headers, data: ct.includes('json') ? await r.json() : Buffer.from(await r.arrayBuffer()) };
  };
}

let owner; let api; let uploaded;
before(async () => { fs.mkdirSync(TMP, { recursive: true }); emu = await startEmulator({ clientId: 'test-client' }); await startServer(); });
after(async () => { await stopServer(); await emu.close(); for (const f of fs.readdirSync(TMP)) if (f.startsWith(path.basename(DB))) fs.rmSync(path.join(TMP, f)); });

test('1) تسجيل الدخول وربط Google Drive عبر OAuth', async () => {
  owner = await login('drive', OWNER);
  assert.equal(owner.location, '/#/settings?connected=1');
  assert.ok(owner.cookie);
  api = client(owner.cookie);
  const me = await api('GET', '/api/me');
  assert.equal(me.data.user.role, 'owner');
  assert.equal(me.data.drive.connected, true);
  assert.deepEqual(me.data.serverProblems, []);
});

test('2) اختيار المجلد الرئيسي وقراءة المجلدات الفرعية واقتراح المطابقة', async () => {
  const roots = await api('GET', '/api/drive/folders?parent=root');
  const rootFolder = roots.data.find((f) => f.name === 'سجل شواهد الأداء 1448');
  assert.ok(rootFolder);
  const m = await api('POST', '/api/settings/root', { folderId: rootFolder.id });
  assert.equal(m.status, 200);
  assert.equal(m.data.folders.length, 11);
  const sug = m.data.suggestions;
  const expected = { duties: 0, plan: 1, classroom: 2, community: 3, strategies: 4, parents: 5, results: 6, analysis: 7, assessment: 8, environment: 9, tech: 10 };
  for (const [k, i] of Object.entries(expected)) assert.equal(sug[k]?.folderId, emu.sub[i].id, `اقتراح ${k}`);
});

test('3) ربط الأقسام بمجلداتها وحفظ Folder IDs ومزامنة الملفات', async () => {
  const m = await api('GET', '/api/mapping');
  const map = Object.fromEntries(Object.entries(m.data.suggestions).map(([k, v]) => [k, v.folderId]));
  const r = await api('POST', '/api/mapping', { map });
  assert.equal(r.status, 200);
  assert.equal(r.data.changed.length, 11);
  const secs = await api('GET', '/api/sections');
  const duties = secs.data.find((s) => s.key === 'duties');
  assert.equal(duties.folderId, emu.sub[0].id);
  assert.equal(duties.count, 2);
  const parents = secs.data.find((s) => s.key === 'parents');
  assert.equal(parents.count, 1);
  // ربط مجلد واحد بقسمين مرفوض
  const dup = await api('POST', '/api/mapping', { map: { plan: emu.sub[0].id } });
  assert.equal(dup.status, 400);
});

test('4) عدم عرض ملفات الأقسام الأخرى أو المجلدات غير المرتبطة', async () => {
  const files = await api('GET', '/api/sections/duties/files');
  assert.ok(files.data.every((f) => f.section === 'duties'));
  const img = files.data.find((f) => f.name === 'IMG_2041.jpg');
  assert.equal(img.path, '1- أداء الواجبات الوظيفيه / صور');
  assert.equal(img.evidenceType, 'صور توثيقية');
  const leak = await api('GET', `/api/files/${emu.privateFile.id}/content`);
  assert.equal(leak.status, 404);
  const s = await api('GET', '/api/search?q=خاص');
  assert.equal(s.data.length, 0);
});

test('5) رفع ملف حقيقي كبير بأجزاء (Resumable) مع الاستئناف وظهوره في القسم الصحيح', async () => {
  const size = 9 * 1024 * 1024 + 123;
  const data = crypto.randomBytes(size);
  const init = await api('POST', '/api/uploads', { sectionKey: 'plan', name: 'خطة علاجية.pdf', size, mimeType: 'application/pdf', evidenceType: 'خطة', evidenceDate: '2026-10-01', description: 'خطة علاجية للفصل الأول' });
  assert.equal(init.status, 200, JSON.stringify(init.data));
  const { uploadId, chunkSize } = init.data;
  const c1 = await api('PUT', `/api/uploads/${uploadId}`, data.subarray(0, chunkSize), { 'content-range': `bytes 0-${chunkSize - 1}/${size}`, 'content-type': 'application/octet-stream' });
  assert.equal(c1.data.next, chunkSize);
  // محاكاة انقطاع: الاستعلام عن الحالة ثم الاستئناف من الموضع الصحيح
  const st = await api('GET', `/api/uploads/${uploadId}/status`);
  assert.equal(st.data.next, chunkSize);
  const c2 = await api('PUT', `/api/uploads/${uploadId}`, data.subarray(chunkSize), { 'content-range': `bytes ${chunkSize}-${size - 1}/${size}`, 'content-type': 'application/octet-stream' });
  assert.equal(c2.data.done, true);
  uploaded = c2.data.file;
  assert.equal(uploaded.section, 'plan');
  assert.equal(uploaded.evidenceType, 'خطة');
  assert.equal(uploaded.evidenceDate, '2026-10-01');
  const inDrive = emu.files.get(uploaded.id);
  assert.equal(inDrive.parents[0], emu.sub[1].id);
  assert.ok(inDrive.content.equals(data), 'المحتوى في Drive مطابق للملف الأصلي');
  const list = await api('GET', '/api/sections/plan/files?sort=newest');
  assert.equal(list.data[0].id, uploaded.id);
  const other = await api('GET', '/api/sections/duties/files');
  assert.ok(!other.data.some((f) => f.id === uploaded.id));
});

test('6) منع تكرار الملفات', async () => {
  const again = await api('POST', '/api/uploads', { sectionKey: 'plan', name: 'خطة علاجية.pdf', size: uploaded.size, mimeType: 'application/pdf' });
  assert.equal(again.status, 409);
  assert.equal(again.data.error.code, 'DUPLICATE');
  await api('POST', '/api/sections/plan/sync');
  const list = await api('GET', '/api/sections/plan/files');
  assert.equal(list.data.filter((f) => f.id === uploaded.id).length, 1, 'المزامنة لا تكرر الملف');
});

test('7) فتح الملف وتنزيله ومعاينة الصور المصغرة ومستندات Google', async () => {
  const dl = await api('GET', `/api/files/${uploaded.id}/content?mode=download`);
  assert.equal(dl.status, 200);
  assert.equal(dl.data.length, uploaded.size);
  assert.match(dl.headers.get('content-disposition'), /^attachment/);
  const view = await api('GET', `/api/files/${uploaded.id}/content`);
  assert.match(view.headers.get('content-disposition'), /^inline/);
  const files = await api('GET', '/api/sections/duties/files?type=image');
  assert.equal(files.data.length, 1);
  const th = await api('GET', `/api/files/${files.data[0].id}/thumbnail`);
  assert.equal(th.status, 200);
  const gdoc = (await api('GET', '/api/sections/plan/files')).data.find((f) => f.mimeType === 'application/vnd.google-apps.document');
  const ex = await api('GET', `/api/files/${gdoc.id}/content?mode=download`);
  assert.equal(ex.status, 200);
  assert.match(decodeURIComponent(ex.headers.get('content-disposition')), /\.docx/);
});

test('8) البحث الشامل والتصنيف', async () => {
  const s = await api('GET', '/api/search?q=علاجية');
  assert.equal(s.data.length, 1);
  assert.equal(s.data[0].sectionTitle, 'إعداد وتنفيذ خطة التعلم');
  const byEv = await api('GET', '/api/search?ev=' + encodeURIComponent('شهادة'));
  assert.ok(byEv.data.some((f) => f.name.includes('شهادة')));
  const byDate = await api('GET', '/api/search?from=2026-09-01&to=2026-10-30');
  assert.ok(byDate.data.some((f) => f.id === uploaded.id));
});

test('9) تعديل الاسم والتصنيف وإنشاء مجلد فرعي', async () => {
  const p = await api('PATCH', `/api/files/${uploaded.id}`, { name: 'خطة علاجية - الفصل الأول.pdf', evidenceType: 'تقرير' });
  assert.equal(p.status, 200);
  assert.equal(emu.files.get(uploaded.id).name, 'خطة علاجية - الفصل الأول.pdf');
  assert.equal(emu.files.get(uploaded.id).appProperties.sjlType, 'تقرير');
  const f = await api('POST', '/api/sections/plan/folders', { name: '1448' });
  assert.equal(f.status, 200);
  assert.equal(emu.files.get(f.data.id).parents[0], emu.sub[1].id);
  const sec = await api('GET', '/api/sections/plan');
  assert.ok(sec.data.folders.some((x) => x.name === '1448'));
  const outside = await api('POST', '/api/sections/plan/folders', { name: 'x', parentId: emu.sub[0].id });
  assert.equal(outside.status, 400);
});

test('10) تجديد رمز الوصول تلقائيًا عند انتهائه', async () => {
  emu.invalidateAccessTokens();
  const before = emu.stats.refreshes;
  const r = await api('POST', '/api/sections/duties/sync');
  assert.equal(r.status, 200);
  assert.ok(emu.stats.refreshes > before);
});

test('11) لوحة التحكم والمساعد والتخزين', async () => {
  const d = await api('GET', '/api/dashboard');
  assert.equal(d.data.total, 5);
  assert.equal(d.data.uploaded, 1);
  assert.equal(d.data.quota.limit, 15 * 1024 ** 3);
  assert.equal(d.data.sections.length, 11);
  const a = await api('POST', '/api/assistant', { action: 'missing', sectionKey: 'duties' });
  assert.equal(a.data.ai, false);
  assert.ok(a.data.sections[0].missing.length > 0);
  const n = await api('POST', '/api/assistant', { action: 'name', fileId: uploaded.id });
  assert.match(n.data.suggestedName, /\.pdf$/);
  const sum = await api('POST', '/api/assistant', { action: 'summarize', fileId: uploaded.id });
  assert.equal(sum.data.error.code, 'AI_DISABLED', 'لا يدّعي وجود ذكاء اصطناعي غير مربوط');
});

test('12) حذف ملف (نقل إلى سلة Drive) بعد التأكيد', async () => {
  const del = await api('DELETE', `/api/files/${uploaded.id}`);
  assert.equal(del.status, 200);
  assert.equal(emu.files.get(uploaded.id).trashed, true);
  const s = await api('GET', '/api/search?q=علاجية');
  assert.equal(s.data.length, 0);
});

test('13) استمرار البيانات بعد إعادة تشغيل الخادم', async () => {
  await stopServer(); await startServer();
  const me = await api('GET', '/api/me');
  assert.equal(me.status, 200, 'الجلسة باقية');
  const secs = await api('GET', '/api/sections');
  assert.equal(secs.data.find((s) => s.key === 'duties').count, 2);
  assert.equal(secs.data.filter((s) => s.folderId).length, 11);
});

test('14) جهاز آخر: مطّلعة تسجل الدخول وترى الملفات نفسها دون صلاحية التعديل', async () => {
  const v = await login('login', VIEWER);
  const vapi = client(v.cookie);
  const secs = await vapi('GET', '/api/sections');
  assert.equal(secs.data.find((s) => s.key === 'duties').count, 2);
  const files = await vapi('GET', '/api/sections/duties/files');
  assert.equal((await vapi('DELETE', `/api/files/${files.data[0].id}`)).status, 403);
  assert.equal((await vapi('POST', '/api/uploads', { sectionKey: 'duties', name: 'x', size: 1 })).status, 403);
  assert.equal((await vapi('GET', '/api/backup')).status, 403);
  // المطّلعة لا تستطيع ربط Drive
  const d = await login('drive', VIEWER);
  assert.match(decodeURIComponent(d.location), /لصاحبة المنصة فقط/);
});

test('15) رفض الحسابات غير المصرح لها وحماية CSRF', async () => {
  const x = await login('login', 'stranger@test.example');
  assert.equal(x.cookie, null);
  assert.match(decodeURIComponent(x.location), /غير مصرّح/);
  const noHeader = await fetch(`${APP}/api/sync`, { method: 'POST', headers: { cookie: owner.cookie } });
  assert.equal(noHeader.status, 403);
  const badOrigin = await fetch(`${APP}/api/sync`, { method: 'POST', headers: { cookie: owner.cookie, 'x-requested-with': 'sjl', origin: 'https://evil.example' } });
  assert.equal(badOrigin.status, 403);
  const forged = await fetch(`${APP}/auth/callback?state=forged&code=drive:${OWNER}`, { redirect: 'manual' });
  assert.match(decodeURIComponent(forged.headers.get('location')), /login\?error/);
});

test('16) عدم تسرب الرموز السرية', async () => {
  const me = await api('GET', '/api/me');
  const txt = JSON.stringify(me.data);
  assert.ok(!/rt_|at_|test-secret/.test(txt));
  const db = new DatabaseSync(DB, { readOnly: true });
  const row = db.prepare('SELECT * FROM google_tokens').get();
  db.close();
  assert.ok(!String(row.refresh_token_enc).startsWith('rt_'), 'رمز التحديث مشفر في قاعدة البيانات');
  const dump = fs.readFileSync(DB).toString('latin1');
  assert.ok(!/rt_[0-9a-f]{16}/.test(dump));
  const js = fs.readdirSync(path.join(ROOT, 'public', 'js')).map((f) => fs.readFileSync(path.join(ROOT, 'public', 'js', f), 'utf8')).join('\n');
  assert.ok(!/client_secret|GOOGLE_CLIENT_SECRET|sk-ant/.test(js), 'لا أسرار في كود الواجهة');
});

test('17) النسخ الاحتياطي واستعادته وإعادة الربط', async () => {
  const b = await api('GET', '/api/backup');
  const backup = Buffer.isBuffer(b.data) ? JSON.parse(b.data.toString()) : b.data;
  assert.match(b.headers.get("content-disposition"), /^attachment/);
  assert.equal(backup.sections.length, 11);
  const toDrive = await api('POST', '/api/backup/drive');
  assert.equal(toDrive.status, 200);
  assert.equal(emu.files.get(toDrive.data.fileId).parents[0], emu.root.id);
  backup.sections.find((s) => s.key === 'duties').targetCount = 9;
  const r = await api('POST', '/api/backup/restore', backup);
  assert.equal(r.status, 200);
  const secs = await api('GET', '/api/sections');
  assert.equal(secs.data.find((s) => s.key === 'duties').targetCount, 9);
  const unmap = await api('POST', '/api/mapping', { map: { tech: null } });
  assert.equal(unmap.data.sections.find((s) => s.key === 'tech').folder_id, null);
  const cm = await api('POST', '/api/mapping/create-missing');
  assert.equal(cm.data.created, 1);
  const audit = await api('GET', '/api/audit');
  assert.ok(audit.data.some((a) => a.action === 'file.upload'));
  const disc = await api('POST', '/api/drive/disconnect');
  assert.equal(disc.status, 200);
  assert.equal((await api('GET', '/api/me')).data.drive.connected, false);
});
