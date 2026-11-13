// واجهة API للمنصة
import { Readable } from 'node:stream';
import { config, configProblems } from './config.js';
import { db, now, audit, getSetting, setSetting, getProfile, tx } from './db.js';
import { AppError, sendJson, readJson, readBody, contentDisposition } from './http.js';
import { SECTIONS, sectionDef, EVIDENCE_TYPES, DEFAULT_PROFILE, suggestMapping } from './sections.js';
import {
  driveStatus, listChildren, getFile, createFolder, updateFile, trashFile, storageQuota, startResumable,
  uploadSmall, revokeAndForget, gfetch, driveError, FOLDER_MIME, EXPORTS,
} from './google.js';
import { syncSection, syncAll, folderPathInSection, indexNewItem, rowFromDrive, upsertRow } from './sync.js';
import { encrypt, decrypt, randomId } from './crypto.js';
import { runAssistant, aiEnabled } from './assistant.js';

const routes = [];
const r = (method, pattern, role, handler) => routes.push({ method, re: new RegExp(`^${pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)')}$`), role, handler });

const MIME_GROUPS = {
  pdf: "mime_type = 'application/pdf'",
  image: "mime_type LIKE 'image/%'",
  video: "mime_type LIKE 'video/%'",
  doc: "(mime_type LIKE '%wordprocessingml%' OR mime_type = 'application/msword' OR mime_type = 'application/vnd.google-apps.document' OR mime_type LIKE 'text/%')",
  sheet: "(mime_type LIKE '%spreadsheet%' OR mime_type = 'application/vnd.ms-excel')",
  slides: "(mime_type LIKE '%presentation%' OR mime_type = 'application/vnd.ms-powerpoint')",
};
const SORTS = { newest: 'COALESCE(evidence_date, created_time) DESC, created_time DESC', oldest: 'COALESCE(evidence_date, created_time) ASC', name: 'name COLLATE NOCASE ASC', size: 'size DESC' };

const cleanName = (s) => String(s || '').replace(/[\u0000-\u001f\\/]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
const pub = (f) => f && ({
  id: f.drive_id, section: f.section_key, sectionTitle: sectionDef(f.section_key)?.title, parentId: f.parent_id, path: f.path, name: f.name,
  mimeType: f.mime_type, isFolder: !!f.is_folder, size: f.size, createdTime: f.created_time, modifiedTime: f.modified_time,
  evidenceDate: f.evidence_date, evidenceType: f.evidence_type, typeInferred: !!f.type_inferred, description: f.description,
  webViewLink: f.web_view_link, hasThumbnail: !!f.has_thumbnail,
});

function sectionRow(key) {
  const s = db.prepare('SELECT * FROM sections WHERE key = ?').get(key);
  if (!s) throw new AppError(404, 'NO_SECTION', 'القسم غير موجود');
  return s;
}
function indexedFile(id) {
  const f = db.prepare('SELECT * FROM files WHERE drive_id = ?').get(id);
  // لا يُسمح بالوصول إلا للملفات الموجودة داخل مجلدات الأقسام المرتبطة
  if (!f) throw new AppError(404, 'NOT_INDEXED', 'الملف غير موجود ضمن مجلدات المنصة');
  return f;
}
function sectionSummary(s) {
  const def = sectionDef(s.key);
  const c = db.prepare('SELECT COUNT(*) n, MAX(created_time) latest, COALESCE(SUM(size),0) bytes FROM files WHERE section_key = ? AND is_folder = 0').get(s.key);
  return {
    key: s.key, order: s.sort_order, title: s.title, icon: def.icon, desc: def.desc, suggestions: def.suggestions,
    folderId: s.folder_id, folderName: s.folder_name, targetCount: s.target_count, lastSync: s.last_sync,
    count: c.n, bytes: c.bytes, latest: c.latest, completion: Math.min(100, Math.round((c.n / Math.max(1, s.target_count)) * 100)),
  };
}

function queryFiles(params, sectionKey) {
  const where = ['is_folder = 0']; const args = {};
  if (sectionKey) { where.push('section_key = :sec'); args.sec = sectionKey; }
  const q = (params.get('q') || '').trim();
  if (q) { where.push('(name LIKE :q OR description LIKE :q OR path LIKE :q OR evidence_type LIKE :q)'); args.q = `%${q.replace(/[%_]/g, '')}%`; }
  const t = params.get('type'); if (t && MIME_GROUPS[t]) where.push(MIME_GROUPS[t]);
  if (t === 'other') where.push(`NOT (${Object.values(MIME_GROUPS).join(' OR ')})`);
  const ev = params.get('ev'); if (ev) { where.push('evidence_type = :ev'); args.ev = ev; }
  const from = params.get('from'); if (from) { where.push('COALESCE(evidence_date, created_time) >= :from'); args.from = from; }
  const to = params.get('to'); if (to) { where.push('substr(COALESCE(evidence_date, created_time),1,10) <= :to'); args.to = to; }
  const folder = params.get('folder');
  if (folder && sectionKey) { where.push('parent_id = :folder'); args.folder = folder; }
  const sort = SORTS[params.get('sort')] || SORTS.newest;
  const limit = Math.min(Number(params.get('limit')) || 1000, 5000);
  return db.prepare(`SELECT * FROM files WHERE ${where.join(' AND ')} ORDER BY ${sort} LIMIT ${limit}`).all(args).map(pub);
}

// ===================== المستخدم والحالة =====================
r('GET', '/api/me', 'viewer', ({ user }) => {
  const root = getSetting('root_folder');
  return {
    user, profile: getProfile(), drive: driveStatus(), root, aiEnabled: aiEnabled(), evidenceTypes: EVIDENCE_TYPES,
    serverProblems: user.role === 'owner' ? configProblems() : [], lastSyncAll: getSetting('last_sync_all'),
    mappedCount: db.prepare('SELECT COUNT(*) n FROM sections WHERE folder_id IS NOT NULL').get().n,
  };
});

// ===================== الأقسام =====================
r('GET', '/api/sections', 'viewer', () => db.prepare('SELECT * FROM sections ORDER BY sort_order').all().map(sectionSummary));

r('GET', '/api/sections/:key', 'viewer', ({ params }) => {
  const s = sectionRow(params.key);
  const folders = db.prepare('SELECT * FROM files WHERE section_key = ? AND is_folder = 1 ORDER BY path, name').all(s.key).map((f) => {
    const n = db.prepare('SELECT COUNT(*) n FROM files WHERE parent_id = ? AND is_folder = 0').get(f.drive_id).n;
    return { ...pub(f), fileCount: n };
  });
  return { ...sectionSummary(s), folders };
});

r('GET', '/api/sections/:key/files', 'viewer', ({ params, url }) => { sectionRow(params.key); return queryFiles(url.searchParams, params.key); });

r('POST', '/api/sections/:key/sync', 'viewer', async ({ params, user }) => {
  const res = await syncSection(params.key);
  audit(user.email, 'section.sync', params.key, res);
  return res;
});
r('POST', '/api/sync', 'viewer', async ({ user }) => { const res = await syncAll(); audit(user.email, 'sync.all', null, { sections: res.length }); return res; });

r('PATCH', '/api/sections/:key', 'owner', async ({ params, req, user }) => {
  sectionRow(params.key);
  const b = await readJson(req);
  const t = Math.round(Number(b.targetCount));
  if (!(t >= 1 && t <= 500)) throw new AppError(400, 'BAD_TARGET', 'العدد المستهدف يجب أن يكون بين 1 و500');
  db.prepare('UPDATE sections SET target_count = ? WHERE key = ?').run(t, params.key);
  audit(user.email, 'section.target', params.key, { t });
  return sectionSummary(sectionRow(params.key));
});

r('POST', '/api/sections/:key/folders', 'owner', async ({ params, req, user }) => {
  const b = await readJson(req);
  const name = cleanName(b.name);
  if (!name) throw new AppError(400, 'NO_NAME', 'اكتبي اسم المجلد');
  const parent = folderPathInSection(params.key, b.parentId);
  const dup = db.prepare('SELECT drive_id FROM files WHERE parent_id = ? AND is_folder = 1 AND name = ?').get(parent.id, name);
  if (dup) throw new AppError(409, 'FOLDER_EXISTS', 'يوجد مجلد بالاسم نفسه في هذا المكان');
  const f = await createFolder(name, parent.id);
  const row = rowFromDrive(f, params.key, parent.id, parent.path); upsertRow(row);
  audit(user.email, 'folder.create', f.id, { name, section: params.key });
  return pub(row);
});

// ===================== البحث والملفات =====================
r('GET', '/api/search', 'viewer', ({ url }) => queryFiles(url.searchParams, null));

r('GET', '/api/files/:id', 'viewer', ({ params }) => pub(indexedFile(params.id)));

r('PATCH', '/api/files/:id', 'owner', async ({ params, req, user }) => {
  const f = indexedFile(params.id);
  const b = await readJson(req);
  const meta = {}; const ap = {};
  if (b.name !== undefined) { const n = cleanName(b.name); if (!n) throw new AppError(400, 'NO_NAME', 'الاسم لا يمكن أن يكون فارغًا'); meta.name = n; }
  if (b.description !== undefined) meta.description = String(b.description).slice(0, 2000);
  if (b.evidenceType !== undefined) { if (b.evidenceType && !EVIDENCE_TYPES.includes(b.evidenceType)) throw new AppError(400, 'BAD_TYPE', 'نوع شاهد غير معروف'); ap.sjlType = b.evidenceType || null; }
  if (b.evidenceDate !== undefined) { if (b.evidenceDate && !/^\d{4}-\d{2}-\d{2}$/.test(b.evidenceDate)) throw new AppError(400, 'BAD_DATE', 'تاريخ غير صالح'); ap.sjlDate = b.evidenceDate || null; }
  if (Object.keys(ap).length) meta.appProperties = ap;
  const updated = await updateFile(f.drive_id, meta);
  const row = rowFromDrive(updated, f.section_key, f.parent_id, f.path); upsertRow(row);
  audit(user.email, 'file.update', f.drive_id, { from: f.name, ...meta });
  return pub(row);
});

r('DELETE', '/api/files/:id', 'owner', async ({ params, user }) => {
  const f = indexedFile(params.id);
  await trashFile(f.drive_id);
  tx(() => {
    db.prepare('DELETE FROM files WHERE drive_id = ?').run(f.drive_id);
    if (f.is_folder) db.prepare("DELETE FROM files WHERE path = ? OR path LIKE ?").run(`${f.path} / ${f.name}`, `${f.path} / ${f.name} / %`);
  });
  audit(user.email, f.is_folder ? 'folder.trash' : 'file.trash', f.drive_id, { name: f.name, section: f.section_key });
  return { ok: true, trashed: true };
});

const DANGEROUS_INLINE = /html|svg|xml|javascript|ecmascript/i;
r('GET', '/api/files/:id/content', 'viewer', async ({ params, url, req, res, user }) => {
  const f = indexedFile(params.id);
  if (f.is_folder) throw new AppError(400, 'IS_FOLDER', 'لا يمكن تنزيل مجلد');
  const download = url.searchParams.get('mode') === 'download';
  const exp = EXPORTS[f.mime_type];
  let gr; let name = f.name;
  if (exp) {
    const mt = download ? exp.dl : exp.view;
    gr = await gfetch(`/drive/v3/files/${f.drive_id}/export`, { query: { mimeType: mt }, raw: true });
    name = `${f.name}.${download ? exp.ext : 'pdf'}`;
  } else if (f.mime_type.startsWith('application/vnd.google-apps')) {
    throw new AppError(415, 'NO_EXPORT', 'هذا النوع من ملفات Google لا يمكن تنزيله، افتحيه من Drive');
  } else {
    gr = await gfetch(`/drive/v3/files/${f.drive_id}`, { query: { alt: 'media', supportsAllDrives: 'true' }, raw: true, headers: req.headers.range ? { Range: req.headers.range } : {} });
  }
  if (!gr.ok) throw driveError(gr.status, await gr.json().catch(() => ({})));
  const type = gr.headers.get('content-type') || 'application/octet-stream';
  const headers = {
    'Content-Type': type, 'Cache-Control': 'private, max-age=300', 'X-Content-Type-Options': 'nosniff',
    'Content-Disposition': contentDisposition(download || DANGEROUS_INLINE.test(type) ? 'attachment' : 'inline', name),
  };
  for (const h of ['content-length', 'content-range', 'accept-ranges']) if (gr.headers.get(h)) headers[h] = gr.headers.get(h);
  if (download) audit(user.email, 'file.download', f.drive_id, { name: f.name });
  res.writeHead(gr.status, headers);
  Readable.fromWeb(gr.body).pipe(res);
  return undefined;
});

const thumbCache = new Map();
r('GET', '/api/files/:id/thumbnail', 'viewer', async ({ params, res }) => {
  const f = indexedFile(params.id);
  let c = thumbCache.get(f.drive_id);
  if (!c || c.exp < now()) {
    const meta = await gfetch(`/drive/v3/files/${f.drive_id}`, { query: { fields: 'thumbnailLink', supportsAllDrives: 'true' } });
    if (!meta.thumbnailLink) throw new AppError(404, 'NO_THUMB', 'لا توجد صورة مصغرة');
    c = { link: meta.thumbnailLink.replace(/=s\d+$/, '=s480'), exp: now() + 30 * 60 * 1000 };
    thumbCache.set(f.drive_id, c);
  }
  const gr = await gfetch(c.link, { absolute: true, raw: true });
  if (!gr.ok) { thumbCache.delete(f.drive_id); throw new AppError(404, 'NO_THUMB', 'تعذر جلب الصورة المصغرة'); }
  res.writeHead(200, { 'Content-Type': gr.headers.get('content-type') || 'image/jpeg', 'Cache-Control': 'private, max-age=1800', 'X-Content-Type-Options': 'nosniff' });
  Readable.fromWeb(gr.body).pipe(res);
  return undefined;
});

// ===================== لوحة التحكم والتخزين =====================
r('GET', '/api/dashboard', 'viewer', async () => {
  const sections = db.prepare('SELECT * FROM sections ORDER BY sort_order').all().map(sectionSummary);
  const total = sections.reduce((a, s) => a + s.count, 0);
  const latest = db.prepare('SELECT * FROM files WHERE is_folder = 0 ORDER BY created_time DESC LIMIT 8').all().map(pub);
  const byType = db.prepare("SELECT COALESCE(evidence_type, 'غير مصنف') t, COUNT(*) n FROM files WHERE is_folder = 0 GROUP BY t ORDER BY n DESC").all();
  const uploaded = db.prepare("SELECT COUNT(*) n FROM uploads WHERE status = 'done'").get().n;
  const bytes = db.prepare('SELECT COALESCE(SUM(size),0) b FROM files WHERE is_folder = 0').get().b;
  let quota = null;
  if (driveStatus().connected) { try { quota = await storageQuota(); } catch { quota = null; } }
  const mapped = sections.filter((s) => s.folderId);
  return {
    total, uploaded, bytes, quota, byType, latest, sections,
    overallCompletion: mapped.length ? Math.round(sections.reduce((a, s) => a + s.completion, 0) / sections.length) : 0,
    incomplete: sections.filter((s) => s.completion < 100).sort((a, b) => a.completion - b.completion),
    top: [...sections].sort((a, b) => b.count - a.count).filter((s) => s.count > 0).slice(0, 3),
    lastSyncAll: getSetting('last_sync_all'),
  };
});
r('GET', '/api/storage', 'viewer', () => storageQuota());

// ===================== إعداد Drive والربط =====================
r('GET', '/api/drive/folders', 'owner', async ({ url }) => {
  const parent = url.searchParams.get('parent') || 'root';
  const folders = await listChildren(parent, { foldersOnly: true });
  return folders.map((f) => ({ id: f.id, name: f.name, modifiedTime: f.modifiedTime }));
});

async function mappingInfo() {
  const root = getSetting('root_folder');
  const sections = db.prepare('SELECT key, title, folder_id, folder_name, sort_order FROM sections ORDER BY sort_order').all();
  if (!root) return { root: null, folders: [], suggestions: {}, sections };
  const folders = (await listChildren(root.id, { foldersOnly: true })).map((f) => ({ id: f.id, name: f.name }));
  return { root, folders, suggestions: suggestMapping(folders), sections };
}

r('POST', '/api/settings/root', 'owner', async ({ req, user }) => {
  const b = await readJson(req);
  const f = await getFile(String(b.folderId || ''));
  if (f.mimeType !== FOLDER_MIME || f.trashed) throw new AppError(400, 'NOT_FOLDER', 'العنصر المحدد ليس مجلدًا');
  setSetting('root_folder', { id: f.id, name: f.name, webViewLink: f.webViewLink });
  audit(user.email, 'root.set', f.id, { name: f.name });
  return mappingInfo();
});

r('GET', '/api/mapping', 'owner', () => mappingInfo());

async function applyMapping(map, email) {
  const ids = Object.values(map).filter(Boolean);
  if (new Set(ids).size !== ids.length) throw new AppError(400, 'DUP_FOLDER', 'لا يمكن ربط المجلد نفسه بأكثر من قسم');
  const resolved = {};
  for (const [key, id] of Object.entries(map)) {
    if (!sectionDef(key)) throw new AppError(400, 'NO_SECTION', `قسم غير معروف: ${key}`);
    if (!id) { resolved[key] = null; continue; }
    const f = await getFile(id);
    if (f.mimeType !== FOLDER_MIME || f.trashed) throw new AppError(400, 'NOT_FOLDER', `العنصر المختار للقسم «${sectionDef(key).title}» ليس مجلدًا`);
    resolved[key] = f;
  }
  const changed = [];
  tx(() => {
    for (const [key, f] of Object.entries(resolved)) {
      const cur = sectionRow(key);
      if ((cur.folder_id || null) === (f?.id || null)) continue;
      db.prepare('UPDATE sections SET folder_id = NULL WHERE key = ?').run(key);
      changed.push(key);
    }
    for (const key of changed) {
      const f = resolved[key];
      db.prepare('DELETE FROM files WHERE section_key = ?').run(key);
      db.prepare('UPDATE sections SET folder_id = ?, folder_name = ?, last_sync = NULL WHERE key = ?').run(f?.id || null, f?.name || null, key);
    }
  });
  audit(email, 'mapping.update', null, { changed });
  for (const key of changed) if (resolved[key]) { try { await syncSection(key); } catch (e) { console.error('[sync]', key, e.message); } }
  return changed;
}

r('POST', '/api/mapping', 'owner', async ({ req, user }) => {
  const b = await readJson(req);
  // يجب أن يأتي التعيين الكامل لتفادي تعارض المعرّفات بين الأقسام
  const full = Object.fromEntries(db.prepare('SELECT key, folder_id FROM sections').all().map((s) => [s.key, s.folder_id]));
  const changed = await applyMapping({ ...full, ...(b.map || {}) }, user.email);
  return { changed, ...(await mappingInfo()) };
});

r('POST', '/api/mapping/create-missing', 'owner', async ({ user }) => {
  const root = getSetting('root_folder');
  if (!root) throw new AppError(409, 'NO_ROOT', 'اختاري المجلد الرئيسي أولًا');
  const missing = db.prepare('SELECT key, title, sort_order FROM sections WHERE folder_id IS NULL ORDER BY sort_order').all();
  const map = {};
  for (const s of missing) { const f = await createFolder(`${s.sort_order}- ${s.title}`, root.id); map[s.key] = f.id; }
  audit(user.email, 'mapping.create_missing', root.id, { created: missing.length });
  const full = Object.fromEntries(db.prepare('SELECT key, folder_id FROM sections').all().map((s) => [s.key, s.folder_id]));
  await applyMapping({ ...full, ...map }, user.email);
  return { created: missing.length, ...(await mappingInfo()) };
});

r('POST', '/api/drive/disconnect', 'owner', async ({ user }) => {
  await revokeAndForget();
  audit(user.email, 'drive.disconnected');
  return { ok: true };
});

// ===================== الإعدادات =====================
r('PUT', '/api/settings/profile', 'owner', async ({ req, user }) => {
  const b = await readJson(req);
  const p = {};
  for (const k of Object.keys(DEFAULT_PROFILE)) if (b[k] !== undefined) p[k] = String(b[k]).trim().slice(0, 150) || DEFAULT_PROFILE[k];
  setSetting('profile', { ...getProfile(), ...p });
  audit(user.email, 'profile.update', null, p);
  return getProfile();
});

r('GET', '/api/viewers', 'owner', () => ({
  fromEnv: config.viewerEmails,
  list: db.prepare("SELECT email, name, last_login, created_at FROM users WHERE role = 'viewer' ORDER BY created_at").all(),
}));
r('POST', '/api/viewers', 'owner', async ({ req, user }) => {
  const email = String((await readJson(req)).email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AppError(400, 'BAD_EMAIL', 'بريد إلكتروني غير صالح');
  if (email === config.ownerEmail) throw new AppError(400, 'IS_OWNER', 'هذا بريد صاحبة المنصة');
  db.prepare("INSERT INTO users (email, role, created_at) VALUES (?, 'viewer', ?) ON CONFLICT(email) DO UPDATE SET role = 'viewer'").run(email, now());
  audit(user.email, 'viewer.add', email);
  return { ok: true };
});
r('DELETE', '/api/viewers/:email', 'owner', ({ params, user }) => {
  const email = decodeURIComponent(params.email).toLowerCase();
  db.prepare("DELETE FROM users WHERE email = ? AND role = 'viewer'").run(email);
  db.prepare('DELETE FROM sessions WHERE email = ?').run(email);
  audit(user.email, 'viewer.remove', email);
  return { ok: true };
});

r('GET', '/api/audit', 'owner', ({ url }) => {
  const limit = Math.min(Number(url.searchParams.get('limit')) || 100, 500);
  return db.prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT ?').all(limit);
});

// ===================== النسخ الاحتياطي =====================
function backupData() {
  return {
    app: 'sijil-shawahid', version: 1, exportedAt: new Date().toISOString(),
    profile: getProfile(), rootFolder: getSetting('root_folder'),
    sections: db.prepare('SELECT key, folder_id, folder_name, target_count FROM sections ORDER BY sort_order').all()
      .map((s) => ({ key: s.key, folderId: s.folder_id, folderName: s.folder_name, targetCount: s.target_count })),
    viewers: db.prepare("SELECT email FROM users WHERE role = 'viewer'").all().map((v) => v.email),
  };
}
r('GET', '/api/backup', 'owner', ({ res, user }) => {
  audit(user.email, 'backup.download');
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': contentDisposition('attachment', `نسخة-احتياطية-سجل-الشواهد-${new Date().toISOString().slice(0, 10)}.json`) });
  res.end(JSON.stringify(backupData(), null, 2));
});
r('POST', '/api/backup/restore', 'owner', async ({ req, user }) => {
  const b = await readJson(req);
  if (b.app !== 'sijil-shawahid' || !Array.isArray(b.sections)) throw new AppError(400, 'BAD_BACKUP', 'ملف النسخة الاحتياطية غير صالح');
  if (b.profile) setSetting('profile', { ...DEFAULT_PROFILE, ...Object.fromEntries(Object.entries(b.profile).filter(([k]) => k in DEFAULT_PROFILE).map(([k, v]) => [k, String(v).slice(0, 150)])) });
  if (b.rootFolder?.id) setSetting('root_folder', { id: String(b.rootFolder.id), name: String(b.rootFolder.name || ''), webViewLink: b.rootFolder.webViewLink || null });
  for (const s of b.sections) if (sectionDef(s.key) && Number(s.targetCount) >= 1) db.prepare('UPDATE sections SET target_count = ? WHERE key = ?').run(Math.min(500, Math.round(s.targetCount)), s.key);
  for (const e of (b.viewers || [])) if (/^[^\s@]+@[^\s@]+$/.test(e)) db.prepare("INSERT OR IGNORE INTO users (email, role, created_at) VALUES (?, 'viewer', ?)").run(String(e).toLowerCase(), now());
  let changed = [];
  if (driveStatus().connected) changed = await applyMapping(Object.fromEntries(b.sections.filter((s) => sectionDef(s.key)).map((s) => [s.key, s.folderId || null])), user.email);
  audit(user.email, 'backup.restore', null, { changed });
  return { ok: true, remapped: changed.length, driveConnected: driveStatus().connected };
});
r('POST', '/api/backup/drive', 'owner', async ({ user }) => {
  const root = getSetting('root_folder');
  if (!root) throw new AppError(409, 'NO_ROOT', 'اختاري المجلد الرئيسي أولًا');
  const data = Buffer.from(JSON.stringify(backupData(), null, 2));
  const name = 'نسخة-احتياطية-إعدادات-سجل-الشواهد.json';
  let fileId = getSetting('backup_file_id');
  let f;
  try { f = await uploadSmall({ name, mimeType: 'application/json', parentId: root.id, data, fileId }); } catch (e) {
    if (!fileId) throw e;
    f = await uploadSmall({ name, mimeType: 'application/json', parentId: root.id, data });
  }
  setSetting('backup_file_id', f.id);
  audit(user.email, 'backup.drive', f.id);
  return { ok: true, fileId: f.id, webViewLink: f.webViewLink };
});

// ===================== الرفع القابل للاستئناف =====================
const CHUNK = 8 * 1024 * 1024; // مضاعف 256KB كما تشترط Google
r('POST', '/api/uploads', 'owner', async ({ req, user }) => {
  const b = await readJson(req);
  const sec = sectionRow(b.sectionKey);
  const parent = folderPathInSection(sec.key, b.parentId);
  const name = cleanName(b.name);
  const size = Number(b.size);
  if (!name) throw new AppError(400, 'NO_NAME', 'اسم الملف مطلوب');
  if (!(size >= 0) || !Number.isFinite(size)) throw new AppError(400, 'BAD_SIZE', 'حجم الملف غير صالح');
  if (b.evidenceType && !EVIDENCE_TYPES.includes(b.evidenceType)) throw new AppError(400, 'BAD_TYPE', 'نوع شاهد غير معروف');
  if (!b.force) {
    const dup = db.prepare('SELECT * FROM files WHERE section_key = ? AND is_folder = 0 AND size = ? AND (name = ? OR name = ?)').get(sec.key, size, name, String(b.originalName || name));
    if (dup) throw new AppError(409, 'DUPLICATE', 'يوجد ملف بالاسم والحجم نفسيهما في هذا القسم', { existing: pub(dup) });
  }
  const q = await storageQuota();
  if (q.limit !== null && q.usage + size > q.limit) throw new AppError(507, 'QUOTA', 'لا توجد مساحة كافية في Google Drive لهذا الملف', { quota: q });
  const appProperties = { sjlApp: '1' };
  if (b.evidenceType) appProperties.sjlType = b.evidenceType;
  if (/^\d{4}-\d{2}-\d{2}$/.test(b.evidenceDate || '')) appProperties.sjlDate = b.evidenceDate;
  const mimeType = /^[\w.+-]+\/[\w.+-]+$/.test(b.mimeType || '') ? b.mimeType : undefined;
  const sessionUri = await startResumable({ name, mimeType, size, parentId: parent.id, appProperties, description: b.description ? String(b.description).slice(0, 2000) : undefined });
  const id = randomId(18);
  db.prepare('INSERT INTO uploads (id, section_key, parent_id, name, size, mime_type, session_uri_enc, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, sec.key, parent.id, name, size, mimeType || null, encrypt(sessionUri), user.email, now(), now());
  return { uploadId: id, chunkSize: CHUNK, name };
});

function uploadRow(id, user) {
  const u = db.prepare('SELECT * FROM uploads WHERE id = ?').get(id);
  if (!u || u.created_by !== user.email) throw new AppError(404, 'NO_UPLOAD', 'جلسة الرفع غير موجودة');
  return u;
}
async function handleGoogleUploadResponse(u, gr, user) {
  if (gr.status === 308) {
    const range = gr.headers.get('range');
    const next = range ? Number(range.split('-')[1]) + 1 : 0;
    db.prepare('UPDATE uploads SET updated_at = ? WHERE id = ?').run(now(), u.id);
    return { done: false, next };
  }
  if (gr.status === 200 || gr.status === 201) {
    const file = await gr.json();
    const row = await indexNewItem(u.section_key, file.parents ? file : file.id, u.parent_id);
    db.prepare("UPDATE uploads SET status = 'done', drive_file_id = ?, updated_at = ? WHERE id = ?").run(row.drive_id, now(), u.id);
    audit(user.email, 'file.upload', row.drive_id, { name: row.name, section: u.section_key, size: u.size });
    return { done: true, file: pub(row) };
  }
  if (gr.status === 404 || gr.status === 410) {
    db.prepare("UPDATE uploads SET status = 'failed', updated_at = ? WHERE id = ?").run(now(), u.id);
    throw new AppError(410, 'SESSION_EXPIRED', 'انتهت جلسة الرفع لدى Google، أعيدي رفع الملف');
  }
  throw driveError(gr.status, await gr.json().catch(() => ({})));
}

r('PUT', '/api/uploads/:id', 'owner', async ({ params, req, user }) => {
  const u = uploadRow(params.id, user);
  if (u.status === 'done') return { done: true, file: pub(db.prepare('SELECT * FROM files WHERE drive_id = ?').get(u.drive_file_id)) };
  if (u.status !== 'active') throw new AppError(410, 'SESSION_EXPIRED', 'جلسة الرفع منتهية');
  const m = String(req.headers['content-range'] || '').match(/^bytes (\d+)-(\d+)\/(\d+)$/);
  const body = await readBody(req, config.uploadChunkMax);
  if (u.size === 0) { // ملف فارغ
    return handleGoogleUploadResponse(u, await gfetch(decrypt(u.session_uri_enc), { method: 'PUT', absolute: true, raw: true, noRetry: true, body, headers: { 'Content-Range': 'bytes */0' } }), user);
  }
  if (!m || Number(m[3]) !== u.size || Number(m[2]) - Number(m[1]) + 1 !== body.length) throw new AppError(400, 'BAD_RANGE', 'نطاق الجزء المرفوع غير صحيح');
  const gr = await gfetch(decrypt(u.session_uri_enc), { method: 'PUT', absolute: true, raw: true, noRetry: true, body, headers: { 'Content-Range': `bytes ${m[1]}-${m[2]}/${m[3]}` } });
  return handleGoogleUploadResponse(u, gr, user);
});

r('GET', '/api/uploads/:id/status', 'owner', async ({ params, user }) => {
  const u = uploadRow(params.id, user);
  if (u.status === 'done') return { done: true, file: pub(db.prepare('SELECT * FROM files WHERE drive_id = ?').get(u.drive_file_id)) };
  if (u.status !== 'active') throw new AppError(410, 'SESSION_EXPIRED', 'جلسة الرفع منتهية');
  const gr = await gfetch(decrypt(u.session_uri_enc), { method: 'PUT', absolute: true, raw: true, noRetry: true, headers: { 'Content-Range': `bytes */${u.size}` } });
  return handleGoogleUploadResponse(u, gr, user);
});

// ===================== المساعد =====================
r('POST', '/api/assistant', 'owner', async ({ req }) => {
  const b = await readJson(req);
  return runAssistant(String(b.action || ''), b);
});

// ===================== الموزّع =====================
export async function handleApi(req, res, url, user) {
  for (const rt of routes) {
    if (rt.method !== req.method) continue;
    const m = url.pathname.match(rt.re);
    if (!m) continue;
    if (!user) throw new AppError(401, 'UNAUTHENTICATED', 'يرجى تسجيل الدخول');
    if (rt.role === 'owner' && user.role !== 'owner') throw new AppError(403, 'FORBIDDEN', 'هذا الإجراء متاح لصاحبة المنصة فقط');
    const out = await rt.handler({ req, res, url, user, params: Object.fromEntries(Object.entries(m.groups || {}).map(([k, v]) => [k, decodeURIComponent(v)])) });
    if (out !== undefined && !res.headersSent) sendJson(res, 200, out);
    return;
  }
  throw new AppError(404, 'NOT_FOUND', 'المسار غير موجود');
}
