// التعامل مع Google OAuth 2.0 و Google Drive API v3 (من الخادم فقط — لا تصل الرموز إلى المتصفح)
import { config } from './config.js';
import { db, now, audit } from './db.js';
import { encrypt, decrypt } from './crypto.js';
import { AppError } from './http.js';

export const FOLDER_MIME = 'application/vnd.google-apps.folder';
export const FILE_FIELDS = 'id,name,mimeType,size,md5Checksum,createdTime,modifiedTime,parents,webViewLink,hasThumbnail,thumbnailLink,description,appProperties,trashed';

export const redirectUri = () => `${config.appUrl}/auth/callback`;

export function authUrl(state, purpose) {
  const p = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: redirectUri(),
    response_type: 'code',
    scope: (purpose === 'drive' ? config.driveScopes : config.loginScopes).join(' '),
    state,
    include_granted_scopes: 'true',
    prompt: purpose === 'drive' ? 'consent select_account' : 'select_account',
  });
  if (purpose === 'drive') p.set('access_type', 'offline');
  return `${config.googleAuthUrl}?${p}`;
}

export async function exchangeCode(code) {
  const r = await fetch(config.googleTokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: config.clientId, client_secret: config.clientSecret, redirect_uri: redirectUri(), grant_type: 'authorization_code' }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new AppError(400, 'OAUTH_EXCHANGE', `تعذر إكمال تسجيل الدخول مع Google (${j.error || r.status})`);
  // id_token وصل مباشرة من خادم Google عبر TLS، لذا يكفي فك ترميزه (وفق توثيق Google)
  const payload = JSON.parse(Buffer.from(String(j.id_token).split('.')[1] || '', 'base64url').toString('utf8') || '{}');
  if (!payload.email || payload.email_verified === false) throw new AppError(400, 'NO_EMAIL', 'لم يتم التحقق من البريد الإلكتروني لحساب Google');
  if (payload.aud && payload.aud !== config.clientId) throw new AppError(400, 'BAD_AUD', 'رمز الهوية لا يخص هذا التطبيق');
  return { tokens: j, profile: { email: payload.email.toLowerCase(), name: payload.name || '', picture: payload.picture || '' } };
}

export function saveDriveTokens(email, t) {
  const existing = db.prepare('SELECT refresh_token_enc FROM google_tokens WHERE id = 1').get();
  const refresh = t.refresh_token ? encrypt(t.refresh_token) : existing?.refresh_token_enc;
  if (!refresh) throw new AppError(400, 'NO_REFRESH', 'لم تُرجع Google رمز تحديث. أعيدي الربط ووافقي على الصلاحيات.');
  if (!String(t.scope || '').includes('auth/drive')) throw new AppError(400, 'SCOPE_DENIED', 'لم تتم الموافقة على صلاحية Google Drive. أعيدي الربط وفعّلي خيار الوصول إلى Drive.');
  db.prepare(`INSERT INTO google_tokens (id, email, refresh_token_enc, access_token_enc, expiry, scope, connected_at, needs_reauth)
              VALUES (1, ?, ?, ?, ?, ?, ?, 0)
              ON CONFLICT(id) DO UPDATE SET email=excluded.email, refresh_token_enc=excluded.refresh_token_enc, access_token_enc=excluded.access_token_enc,
              expiry=excluded.expiry, scope=excluded.scope, connected_at=excluded.connected_at, needs_reauth=0`)
    .run(email, refresh, encrypt(t.access_token), now() + (t.expires_in || 3600) * 1000, t.scope || '', now());
}

export function driveStatus() {
  const r = db.prepare('SELECT email, scope, connected_at, needs_reauth FROM google_tokens WHERE id = 1').get();
  return r ? { connected: !r.needs_reauth, needsReauth: !!r.needs_reauth, email: r.email, connectedAt: r.connected_at } : { connected: false };
}

let refreshing = null;
async function getAccessToken(force = false) {
  const row = db.prepare('SELECT * FROM google_tokens WHERE id = 1').get();
  if (!row) throw new AppError(409, 'DRIVE_NOT_CONNECTED', 'لم يتم ربط حساب Google Drive بعد');
  if (row.needs_reauth) throw new AppError(409, 'DRIVE_REAUTH', 'انتهت صلاحية الربط مع Google Drive. أعيدي الربط من الإعدادات.');
  if (!force && row.access_token_enc && row.expiry > now() + 60_000) return decrypt(row.access_token_enc);
  if (!refreshing) {
    refreshing = (async () => {
      const r = await fetch(config.googleTokenUrl, {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, refresh_token: decrypt(row.refresh_token_enc), grant_type: 'refresh_token' }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        if (j.error === 'invalid_grant') {
          db.prepare('UPDATE google_tokens SET needs_reauth = 1 WHERE id = 1').run();
          audit(row.email, 'drive.token_revoked');
          throw new AppError(409, 'DRIVE_REAUTH', 'أُلغي الربط أو انتهت صلاحيته لدى Google. أعيدي ربط حساب Google Drive.');
        }
        throw new AppError(502, 'TOKEN_REFRESH', 'تعذر تجديد الاتصال مع Google، حاولي بعد قليل');
      }
      db.prepare('UPDATE google_tokens SET access_token_enc = ?, expiry = ? WHERE id = 1').run(encrypt(j.access_token), now() + (j.expires_in || 3600) * 1000);
      return j.access_token;
    })().finally(() => { refreshing = null; });
  }
  return refreshing;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// طلب عام إلى Google API مع تجديد الرمز تلقائيًا وإعادة المحاولة عند الأخطاء المؤقتة
export async function gfetch(urlPath, { method = 'GET', query, json, body, headers = {}, raw = false, absolute = false, noRetry = false } = {}) {
  let url = absolute ? urlPath : `${config.googleApiBase}${urlPath}`;
  if (query) url += (url.includes('?') ? '&' : '?') + new URLSearchParams(query);
  let forced = false;
  for (let attempt = 0; attempt < 4; attempt++) {
    const token = await getAccessToken(forced);
    const h = { Authorization: `Bearer ${token}`, ...headers };
    let b = body;
    if (json !== undefined) { h['Content-Type'] = 'application/json; charset=UTF-8'; b = JSON.stringify(json); }
    let r;
    try {
      r = await fetch(url, { method, headers: h, body: b, redirect: 'manual' });
    } catch (e) {
      if (attempt < 2 && !noRetry) { await sleep(500 * 2 ** attempt); continue; }
      throw new AppError(502, 'NETWORK', 'تعذر الاتصال بخوادم Google');
    }
    if (r.status === 401 && !forced) { forced = true; continue; }
    if ((r.status === 429 || r.status >= 500) && attempt < 3 && !noRetry) {
      await sleep(700 * 2 ** attempt); continue;
    }
    if (raw) return r;
    if (r.status === 204) return null;
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw driveError(r.status, j);
    return j;
  }
  throw new AppError(502, 'GOOGLE_BUSY', 'خدمة Google مشغولة حاليًا، حاولي مجددًا');
}

export function driveError(status, j) {
  const reason = j?.error?.errors?.[0]?.reason || j?.error?.status || '';
  const msg = j?.error?.message || '';
  if (status === 404) return new AppError(404, 'DRIVE_NOT_FOUND', 'الملف أو المجلد غير موجود في Google Drive (ربما حُذف)');
  if (status === 403 && /storageQuota|quotaExceeded/i.test(reason + msg)) return new AppError(507, 'QUOTA', 'المساحة التخزينية في Google Drive ممتلئة');
  if (status === 403) return new AppError(403, 'DRIVE_FORBIDDEN', 'لا توجد صلاحية كافية على هذا الملف في Google Drive');
  return new AppError(status >= 400 && status < 600 ? status : 502, 'DRIVE_ERROR', `خطأ من Google Drive: ${msg || status}`);
}

// ---------------- عمليات Drive ----------------
const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");

export async function listChildren(folderId, { foldersOnly = false } = {}) {
  const out = []; let pageToken;
  let q = `'${esc(folderId)}' in parents and trashed = false`;
  if (foldersOnly) q += ` and mimeType = '${FOLDER_MIME}'`;
  do {
    const j = await gfetch('/drive/v3/files', { query: { q, fields: `nextPageToken,files(${FILE_FIELDS})`, pageSize: '1000', orderBy: 'folder,name', supportsAllDrives: 'true', includeItemsFromAllDrives: 'true', ...(pageToken ? { pageToken } : {}) } });
    out.push(...(j.files || []));
    pageToken = j.nextPageToken;
  } while (pageToken);
  return out;
}

export const getFile = (id) => gfetch(`/drive/v3/files/${encodeURIComponent(id)}`, { query: { fields: FILE_FIELDS, supportsAllDrives: 'true' } });

export const createFolder = (name, parentId) => gfetch('/drive/v3/files', {
  method: 'POST', query: { fields: FILE_FIELDS, supportsAllDrives: 'true' },
  json: { name, mimeType: FOLDER_MIME, parents: [parentId] },
});

export const updateFile = (id, meta) => gfetch(`/drive/v3/files/${encodeURIComponent(id)}`, {
  method: 'PATCH', query: { fields: FILE_FIELDS, supportsAllDrives: 'true' }, json: meta,
});

// الحذف = نقل إلى سلة مهملات Drive (قابل للاسترجاع 30 يومًا) حفاظًا على سلامة الملفات
export const trashFile = (id) => updateFile(id, { trashed: true });

export async function storageQuota() {
  const j = await gfetch('/drive/v3/about', { query: { fields: 'storageQuota,user(emailAddress,displayName)' } });
  const q = j.storageQuota || {};
  return {
    limit: q.limit ? Number(q.limit) : null, // null = حساب بلا حد محدد (مثل بعض حسابات Workspace)
    usage: Number(q.usage || 0),
    usageInDrive: Number(q.usageInDrive || 0),
    usageInDriveTrash: Number(q.usageInDriveTrash || 0),
    email: j.user?.emailAddress,
  };
}

export async function startResumable({ name, mimeType, size, parentId, appProperties, description }) {
  const r = await gfetch('/upload/drive/v3/files', {
    method: 'POST', raw: true,
    query: { uploadType: 'resumable', supportsAllDrives: 'true', fields: FILE_FIELDS },
    json: { name, parents: [parentId], ...(mimeType ? { mimeType } : {}), appProperties, ...(description ? { description } : {}) },
    headers: { 'X-Upload-Content-Length': String(size), ...(mimeType ? { 'X-Upload-Content-Type': mimeType } : {}) },
  });
  if (!r.ok) throw driveError(r.status, await r.json().catch(() => ({})));
  const loc = r.headers.get('location');
  if (!loc) throw new AppError(502, 'NO_SESSION', 'لم تُنشئ Google جلسة رفع');
  return loc;
}

export async function uploadSmall({ name, mimeType, parentId, data, fileId }) {
  const boundary = 'sjl' + Math.random().toString(36).slice(2);
  const meta = fileId ? { name } : { name, parents: [parentId], mimeType };
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`),
    Buffer.from(data), Buffer.from(`\r\n--${boundary}--`),
  ]);
  return gfetch(fileId ? `/upload/drive/v3/files/${fileId}` : '/upload/drive/v3/files', {
    method: fileId ? 'PATCH' : 'POST', query: { uploadType: 'multipart', fields: FILE_FIELDS, supportsAllDrives: 'true' },
    body, headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
  });
}

export async function revokeAndForget() {
  const row = db.prepare('SELECT refresh_token_enc FROM google_tokens WHERE id = 1').get();
  if (row) {
    try { await fetch(`${config.googleRevokeUrl}?token=${encodeURIComponent(decrypt(row.refresh_token_enc))}`, { method: 'POST' }); } catch { /* تجاهل */ }
  }
  db.prepare('DELETE FROM google_tokens').run();
}

export const EXPORTS = {
  'application/vnd.google-apps.document': { view: 'application/pdf', dl: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', ext: 'docx', text: 'text/plain' },
  'application/vnd.google-apps.spreadsheet': { view: 'application/pdf', dl: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ext: 'xlsx', text: 'text/csv' },
  'application/vnd.google-apps.presentation': { view: 'application/pdf', dl: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', ext: 'pptx', text: 'text/plain' },
  'application/vnd.google-apps.drawing': { view: 'application/pdf', dl: 'image/png', ext: 'png' },
};
