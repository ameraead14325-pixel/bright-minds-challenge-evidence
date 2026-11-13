// تشغيل المنصة مقابل محاكي Google لمعاينة الواجهة محليًا (للتطوير فقط)
// node tests/ui-demo.mjs  ← يطبع كوكي الجلسة لصاحبة المنصة والمطّلعة
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { startEmulator } from './google-emulator.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const PORT = 3999; const APP = `http://localhost:${PORT}`;
fs.mkdirSync(path.join(ROOT, 'tests/.tmp'), { recursive: true });
const DB = path.join(ROOT, 'tests/.tmp/demo.db'); for (const s of ['', '-wal', '-shm']) fs.rmSync(DB + s, { force: true });
const emu = await startEmulator({ clientId: 'test-client' });
const proc = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server/index.js'], { cwd: ROOT, stdio: 'inherit', env: { ...process.env, PORT: String(PORT), APP_URL: APP, DATABASE_PATH: DB, GOOGLE_CLIENT_ID: 'test-client', GOOGLE_CLIENT_SECRET: 'test-secret', OWNER_EMAIL: 'owner@test.example', VIEWER_EMAILS: 'principal@test.example', TOKEN_ENCRYPTION_KEY: 'cd'.repeat(32), GOOGLE_AUTH_URL: `${emu.base}/auth`, GOOGLE_TOKEN_URL: `${emu.base}/token`, GOOGLE_REVOKE_URL: `${emu.base}/revoke`, GOOGLE_API_BASE: emu.base } });
await new Promise((r) => setTimeout(r, 1200));
async function login(purpose, email) {
  const r1 = await fetch(`${APP}/auth/${purpose === 'drive' ? 'connect-drive' : 'login'}`, { redirect: 'manual' });
  const state = new URL(r1.headers.get('location')).searchParams.get('state');
  const oc = r1.headers.getSetCookie()[0].split(';')[0];
  const r2 = await fetch(`${APP}/auth/callback?state=${state}&code=${purpose}:${email}`, { redirect: 'manual', headers: { cookie: oc } });
  return r2.headers.getSetCookie().find((c) => c.startsWith('sjl_sid')).split(';')[0];
}
const owner = await login('drive', 'owner@test.example');
const h = { cookie: owner, 'x-requested-with': 'sjl', 'content-type': 'application/json' };
if (process.argv[2] !== 'nosetup') {
  const m = await (await fetch(`${APP}/api/settings/root`, { method: 'POST', headers: h, body: JSON.stringify({ folderId: emu.root.id }) })).json();
  const map = Object.fromEntries(Object.entries(m.suggestions).map(([k, v]) => [k, v.folderId]));
  await fetch(`${APP}/api/mapping`, { method: 'POST', headers: h, body: JSON.stringify({ map }) });
}
const viewer = await login('login', 'principal@test.example');
fs.writeFileSync(path.join(ROOT, 'tests/.tmp/cookies.json'), JSON.stringify({ owner, viewer, app: APP }));
console.log('READY', APP);
process.on('SIGTERM', () => { proc.kill(); emu.close(); process.exit(0); });
