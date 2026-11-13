// اختبار التشغيل على استضافة بلا قرص دائم: حذف قاعدة البيانات بالكامل ثم استعادة الحالة من Upstash
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { startEmulator } from './google-emulator.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const TMP = path.join(ROOT, 'tests', '.tmp'); fs.mkdirSync(TMP, { recursive: true });
const DB = path.join(TMP, `persist-${Date.now()}.db`);
const PORT = 3800 + Math.floor(Math.random() * 90); const APP = `http://localhost:${PORT}`;
const emu = await startEmulator({ clientId: 'test-client' });
let proc;
const wipe = () => { for (const s of ['', '-wal', '-shm']) fs.rmSync(DB + s, { force: true }); };
const start = () => new Promise((resolve, reject) => {
  proc = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server/index.js'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, PORT: String(PORT), APP_URL: APP, DATABASE_PATH: DB, GOOGLE_CLIENT_ID: 'test-client', GOOGLE_CLIENT_SECRET: 'test-secret', OWNER_EMAIL: 'owner@test.example', TOKEN_ENCRYPTION_KEY: 'ef'.repeat(32), GOOGLE_AUTH_URL: `${emu.base}/auth`, GOOGLE_TOKEN_URL: `${emu.base}/token`, GOOGLE_REVOKE_URL: `${emu.base}/revoke`, GOOGLE_API_BASE: emu.base, UPSTASH_REDIS_REST_URL: `${emu.base}/redis`, UPSTASH_REDIS_REST_TOKEN: 'redis-token' } });
  proc.stdout.on('data', (d) => { if (String(d).includes('تعمل على')) resolve(); });
  proc.stderr.on('data', (d) => process.stderr.write(d));
  proc.on('exit', (c) => c && reject(new Error('exit ' + c)));
});
const stop = () => new Promise((r) => { proc.once('exit', r); proc.kill('SIGTERM'); });
after(async () => { await stop().catch(() => {}); wipe(); await emu.close(); });

test('الحالة تبقى بعد حذف قاعدة البيانات (استضافة مجانية بلا قرص)', async () => {
  await start();
  const r1 = await fetch(`${APP}/auth/connect-drive`, { redirect: 'manual' });
  const state = new URL(r1.headers.get('location')).searchParams.get('state');
  const oc = r1.headers.getSetCookie()[0].split(';')[0];
  const r2 = await fetch(`${APP}/auth/callback?state=${state}&code=drive:owner@test.example`, { redirect: 'manual', headers: { cookie: oc } });
  const cookie = r2.headers.getSetCookie().find((c) => c.startsWith('sjl_sid')).split(';')[0];
  const h = { cookie, 'x-requested-with': 'sjl', 'content-type': 'application/json' };
  const m = await (await fetch(`${APP}/api/settings/root`, { method: 'POST', headers: h, body: JSON.stringify({ folderId: emu.root.id }) })).json();
  await fetch(`${APP}/api/mapping`, { method: 'POST', headers: h, body: JSON.stringify({ map: Object.fromEntries(Object.entries(m.suggestions).map(([k, v]) => [k, v.folderId])) }) });
  await fetch(`${APP}/api/settings/profile`, { method: 'PUT', headers: h, body: JSON.stringify({ teacher: 'أ. فاطمة محمد (اختبار)' }) });
  await stop();
  assert.ok(emu.stats.redisSets > 0);
  assert.ok(!String([...emu.kv.values()][0]).includes('owner@test.example'), 'الحالة مشفرة في Upstash');
  wipe(); // محاكاة إعادة تشغيل الاستضافة المجانية: ضياع القرص بالكامل
  await start();
  const me = await (await fetch(`${APP}/api/me`, { headers: h })).json();
  assert.equal(me.user.role, 'owner', 'الجلسة استُعيدت');
  assert.equal(me.drive.connected, true, 'ربط Drive استُعيد');
  assert.equal(me.mappedCount, 11, 'ربط الأقسام استُعيد');
  assert.equal(me.profile.teacher, 'أ. فاطمة محمد (اختبار)');
  const sync = await (await fetch(`${APP}/api/sync`, { method: 'POST', headers: h })).json();
  assert.equal(sync.length, 11);
  const secs = await (await fetch(`${APP}/api/sections`, { headers: h })).json();
  assert.equal(secs.find((s) => s.key === 'duties').count, 2, 'الفهرس أعيد بناؤه من Drive');
});
