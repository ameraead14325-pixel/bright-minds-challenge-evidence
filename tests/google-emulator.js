// محاكي محلي لواجهات Google OAuth و Drive v3 — يُستخدم فقط في الاختبارات الآلية (npm test)
// لا يدخل في تشغيل المنصة الفعلي؛ المنصة في الإنتاج تتصل بخوادم Google الحقيقية.
import http from 'node:http';
import crypto from 'node:crypto';

export function startEmulator({ clientId }) {
  const FOLDER = 'application/vnd.google-apps.folder';
  const files = new Map();
  const tokens = new Map(); // access token -> email
  const refreshTokens = new Map();
  const sessions = new Map();
  const stats = { refreshes: 0, revoked: 0, redisSets: 0 };
  const kv = new Map();
  let seq = 0;
  const id = () => `f${++seq}${crypto.randomBytes(3).toString('hex')}`;
  const add = (name, parent, mimeType = FOLDER, content = null, extra = {}) => {
    const f = { id: id(), name, parents: [parent], mimeType, createdTime: new Date(Date.now() - (100 - seq) * 864e5).toISOString(), modifiedTime: new Date().toISOString(), trashed: false, appProperties: {}, ...extra };
    if (content) { f.content = Buffer.from(content); f.size = String(f.content.length); f.md5Checksum = crypto.createHash('md5').update(f.content).digest('hex'); }
    files.set(f.id, f); return f;
  };
  // بيانات المحاكاة: مجلد رئيسي بأسماء فرعية مختلفة قليلًا عن أسماء الأقسام
  const root = add('سجل شواهد الأداء 1448', 'root');
  const names = ['1- أداء الواجبات الوظيفيه', 'خطة التعلم', 'الادارة الصفية', 'التفاعل مع المجتمع المهني', 'استراتيجيات التعلم', 'التواصل مع اولياء الامور',
    'تحسين نتائج المتعلمين', 'تحليل النتائج وتشخيص المستويات', 'تنويع التقويم', 'تهيئة البيئة التعليمية', 'توظيف التقنيات والوسائل'];
  const sub = names.map((n) => add(n, root.id));
  add('شهادة شكر وتقدير.pdf', sub[0].id, 'application/pdf', '%PDF-1.4 test certificate');
  const pics = add('صور', sub[0].id);
  add('IMG_2041.jpg', pics.id, 'image/jpeg', 'JPEGDATA', { hasThumbnail: true });
  add('سجل التواصل.docx', sub[5].id, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'DOCX');
  add('خطة توزيع المنهج', sub[1].id, 'application/vnd.google-apps.document');
  const privateFolder = add('صور شخصية', 'root');
  const privateFile = add('خاص.jpg', privateFolder.id, 'image/jpeg', 'PRIVATE');

  const send = (res, status, data, headers = {}) => { res.writeHead(status, { 'Content-Type': 'application/json', ...headers }); res.end(data === undefined ? '' : JSON.stringify(data)); };
  const body = (req) => new Promise((r) => { const c = []; req.on('data', (d) => c.push(d)); req.on('end', () => r(Buffer.concat(c))); });
  const pub = (f) => { const { content, ...m } = f; return { ...m, webViewLink: `https://drive.google.com/file/d/${f.id}/view`, ...(f.hasThumbnail ? { thumbnailLink: `${base}/thumb/${f.id}=s220` } : {}) }; };
  const idToken = (email) => ['e30', Buffer.from(JSON.stringify({ email, email_verified: true, aud: clientId, name: email.split('@')[0] })).toString('base64url'), 'sig'].join('.');
  let base = '';

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, base);
    const p = url.pathname;
    const buf = await body(req);
    if (p === '/token') {
      const f = new URLSearchParams(buf.toString());
      if (f.get('client_secret') !== 'test-secret') return send(res, 401, { error: 'invalid_client' });
      if (f.get('grant_type') === 'authorization_code') {
        const [purpose, email] = f.get('code').split(':');
        const at = 'at_' + crypto.randomBytes(8).toString('hex'); tokens.set(at, email);
        const out = { access_token: at, expires_in: 3600, id_token: idToken(email), scope: purpose === 'drive' ? 'openid email profile https://www.googleapis.com/auth/drive' : 'openid email profile' };
        if (purpose === 'drive') { const rt = 'rt_' + crypto.randomBytes(8).toString('hex'); refreshTokens.set(rt, email); out.refresh_token = rt; }
        return send(res, 200, out);
      }
      if (f.get('grant_type') === 'refresh_token') {
        const email = refreshTokens.get(f.get('refresh_token'));
        if (!email) return send(res, 400, { error: 'invalid_grant' });
        stats.refreshes++;
        const at = 'at_' + crypto.randomBytes(8).toString('hex'); tokens.set(at, email);
        return send(res, 200, { access_token: at, expires_in: 3600 });
      }
    }
    if (p === '/redis') { // محاكي Upstash Redis REST
      if (req.headers.authorization !== 'Bearer redis-token') return send(res, 401, { error: 'Unauthorized' });
      const [cmd, key, val] = JSON.parse(buf.toString());
      if (cmd === 'GET') return send(res, 200, { result: kv.get(key) ?? null });
      if (cmd === 'SET') { kv.set(key, val); stats.redisSets++; return send(res, 200, { result: 'OK' }); }
    }
    if (p === '/revoke') { refreshTokens.delete(url.searchParams.get('token')); stats.revoked++; return send(res, 200, {}); }

    // الجلسات القابلة للاستئناف
    if (p.startsWith('/upload-session/')) {
      const s = sessions.get(p.split('/').pop());
      if (!s) return send(res, 404, { error: { message: 'not found' } });
      const cr = req.headers['content-range'] || '';
      let m;
      if ((m = cr.match(/^bytes \*\/(\d+)$/))) {
        if (s.done) return send(res, 200, pub(s.done));
        return send(res, 308, undefined, s.received ? { Range: `bytes=0-${s.received - 1}` } : {});
      }
      m = cr.match(/^bytes (\d+)-(\d+)\/(\d+)$/);
      if (!m || Number(m[1]) !== s.received) return send(res, 400, { error: { message: 'bad range' } });
      s.chunks.push(buf); s.received += buf.length;
      if (s.received < s.size) return send(res, 308, undefined, { Range: `bytes=0-${s.received - 1}` });
      const f = add(s.meta.name, s.meta.parents[0], s.meta.mimeType || 'application/octet-stream', Buffer.concat(s.chunks), { appProperties: s.meta.appProperties || {}, description: s.meta.description });
      s.done = f; return send(res, 200, pub(f));
    }
    if (p.startsWith('/thumb/')) { res.writeHead(200, { 'Content-Type': 'image/png' }); return res.end('PNGTHUMB'); }

    // كل ما بعد هذا يتطلب رمز وصول صالح
    const auth = (req.headers.authorization || '').replace('Bearer ', '');
    if (!tokens.has(auth)) return send(res, 401, { error: { code: 401, message: 'Invalid Credentials' } });

    if (p === '/drive/v3/about') return send(res, 200, { user: { emailAddress: tokens.get(auth) }, storageQuota: { limit: String(15 * 1024 ** 3), usage: String(2 * 1024 ** 3), usageInDrive: String(1024 ** 3) } });
    if (p === '/upload/drive/v3/files' && url.searchParams.get('uploadType') === 'resumable') {
      const sid = crypto.randomBytes(6).toString('hex');
      sessions.set(sid, { meta: JSON.parse(buf.toString() || '{}'), size: Number(req.headers['x-upload-content-length']), received: 0, chunks: [] });
      return send(res, 200, {}, { Location: `${base}/upload-session/${sid}` });
    }
    if (p.startsWith('/upload/drive/v3/files') && url.searchParams.get('uploadType') === 'multipart') {
      const txt = buf.toString(); const meta = JSON.parse(txt.slice(txt.indexOf('{'), txt.indexOf('}\r\n') + 1));
      const fid = p.split('/')[5];
      if (fid && files.has(fid)) { const f = files.get(fid); f.modifiedTime = new Date().toISOString(); return send(res, 200, pub(f)); }
      return send(res, 200, pub(add(meta.name, meta.parents[0], meta.mimeType, 'JSON')));
    }
    if (p === '/drive/v3/files' && req.method === 'GET') {
      const q = url.searchParams.get('q');
      const parent = q.match(/'([^']+)' in parents/)[1];
      const onlyFolders = q.includes(FOLDER);
      const list = [...files.values()].filter((f) => f.parents[0] === parent && !f.trashed && (!onlyFolders || f.mimeType === FOLDER));
      return send(res, 200, { files: list.map(pub) });
    }
    if (p === '/drive/v3/files' && req.method === 'POST') { const m = JSON.parse(buf.toString()); return send(res, 200, pub(add(m.name, m.parents[0], m.mimeType))); }
    const m = p.match(/^\/drive\/v3\/files\/([^/]+)(\/export)?$/);
    if (m) {
      const f = files.get(m[1]);
      if (!f) return send(res, 404, { error: { code: 404, message: 'File not found' } });
      if (m[2]) { res.writeHead(200, { 'Content-Type': url.searchParams.get('mimeType') }); return res.end('EXPORTED:' + f.name); }
      if (req.method === 'PATCH') {
        const u = JSON.parse(buf.toString() || '{}');
        if (u.name) f.name = u.name;
        if (u.description !== undefined) f.description = u.description;
        if (u.trashed) f.trashed = true;
        if (u.appProperties) for (const [k, v] of Object.entries(u.appProperties)) { if (v === null) delete f.appProperties[k]; else f.appProperties[k] = v; }
        return send(res, 200, pub(f));
      }
      if (url.searchParams.get('alt') === 'media') { res.writeHead(200, { 'Content-Type': f.mimeType, 'Content-Length': f.content.length }); return res.end(f.content); }
      return send(res, 200, pub(f));
    }
    send(res, 404, { error: { message: 'emulator: unknown ' + p } });
  });

  return new Promise((resolve) => server.listen(0, () => {
    base = `http://127.0.0.1:${server.address().port}`;
    resolve({
      base, files, stats, kv, root, sub, privateFile, server,
      invalidateAccessTokens: () => tokens.clear(),
      close: () => new Promise((r) => { server.closeAllConnections(); server.close(r); }),
    });
  }));
}
