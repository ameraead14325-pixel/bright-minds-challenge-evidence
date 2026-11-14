// خادم منصة سجل شواهد الأداء الوظيفي 1448هـ
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { config, configProblems, ROOT } from './config.js';
import { cleanup } from './db.js';
import { AppError, sendJson } from './http.js';
import { handleAuth, getSession } from './auth.js';
import { handleApi } from './routes.js';
import { restoreState, schedulePush, flushNow, persistEnabled, persistStatus } from './persist.js';

const PUBLIC = path.join(ROOT, 'public');
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2' };

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'SAMEORIGIN',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy': [
    "default-src 'self'", "script-src 'self'", "style-src 'self' https://fonts.googleapis.com 'unsafe-inline'",
    "font-src 'self' https://fonts.gstatic.com", "img-src 'self' data: blob: https://*.googleusercontent.com",
    "media-src 'self' blob:", "frame-src 'self' https://drive.google.com https://docs.google.com", "connect-src 'self'",
    "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'self'",
  ].join('; '),
};
if (config.appUrl.startsWith('https://')) SECURITY_HEADERS['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains';

function serveStatic(req, res, url) {
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/' || !path.extname(rel)) rel = '/index.html';
  const file = path.normalize(path.join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC + path.sep)) { res.writeHead(403); return res.end(); }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('غير موجود'); }
    const ext = path.extname(file);
    res.writeHead(200, { 'Content-Type': TYPES[ext] || 'application/octet-stream', 'Content-Length': st.size, 'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600' });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  });
}

// حماية CSRF: الطلبات المعدِّلة يجب أن تأتي من نفس الأصل ومع ترويسة مخصصة
function checkCsrf(req) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return;
  if (req.headers['x-requested-with'] !== 'sjl') throw new AppError(403, 'CSRF', 'طلب مرفوض');
  const origin = req.headers.origin;
  if (origin && origin !== config.appUrl) throw new AppError(403, 'CSRF', 'طلب من مصدر غير موثوق');
}

// تبدأ المنصة بالاستماع فورًا (لفحص الصحة)، وتنتظر الطلبات الأخرى حتى تكتمل استعادة الحالة
let readyResolve; const ready = new Promise((r) => { readyResolve = r; });
const server = http.createServer(async (req, res) => {
  if (!req.url.startsWith('/healthz')) await ready;
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
  const url = new URL(req.url, config.appUrl);
  const started = Date.now();
  if (req.method !== 'GET' || url.pathname === '/auth/callback') res.on('finish', schedulePush);
  try {
    if (url.pathname === '/healthz') { const pr = configProblems(); return sendJson(res, 200, { ok: true, configured: pr.length === 0, missing: pr.map((x) => x.split(' ')[0]), storage: persistStatus() }); }
    if (url.pathname.startsWith('/auth/')) { if (req.method === 'POST') checkCsrf(req); return await handleAuth(req, res, url); }
    if (url.pathname.startsWith('/api/')) {
      checkCsrf(req);
      return await handleApi(req, res, url, getSession(req));
    }
    if (req.method === 'GET' || req.method === 'HEAD') return serveStatic(req, res, url);
    res.writeHead(405); res.end();
  } catch (e) {
    const status = e instanceof AppError ? e.status : 500;
    if (!(e instanceof AppError)) console.error('[error]', req.method, url.pathname, e);
    else if (status >= 500) console.error('[api]', req.method, url.pathname, status, e.code, e.message);
    if (!res.headersSent) sendJson(res, status, { error: { code: e.code || 'SERVER_ERROR', message: e instanceof AppError ? e.message : 'حدث خطأ غير متوقع في الخادم', ...(e.extra || {}) } });
    else res.destroy();
  } finally {
    if (url.pathname.startsWith('/api/') && Date.now() - started > 3000) console.log('[slow]', req.method, url.pathname, Date.now() - started, 'ms');
  }
});

server.requestTimeout = 0; // رفع أجزاء كبيرة قد يستغرق وقتًا
server.headersTimeout = 60_000;
console.log(`… بدء التشغيل (Node ${process.version})، المنفذ ${config.port}`);
server.listen(config.port, '0.0.0.0', async () => {
  if (persistEnabled()) {
    console.log('… استعادة الحالة المحفوظة من Upstash');
    try { await restoreState(); } catch (e) { console.error('[persist] خطأ في الاستعادة:', e.message); }
  }
  readyResolve();
  console.log(`✓ منصة سجل الشواهد تعمل على ${config.appUrl} (المنفذ ${config.port})`);
  const p = configProblems();
  if (p.length) console.warn('⚠ إعدادات ناقصة:\n  - ' + p.join('\n  - '));
});
cleanup();
setInterval(cleanup, 6 * 3600 * 1000).unref();

for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, async () => {
  setTimeout(() => process.exit(0), 8000).unref();
  try { await flushNow(); } catch { /* */ }
  server.close(() => process.exit(0));
});
