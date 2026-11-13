// مزامنة فهرس الملفات من مجلدات الأقسام في Google Drive (بدون نسخ المحتوى أو تكراره)
import { db, now, tx, setSetting } from './db.js';
import { listChildren, FOLDER_MIME, getFile } from './google.js';
import { inferEvidenceType } from './sections.js';
import { AppError } from './http.js';

const MAX_DEPTH = 8;
const MAX_ITEMS = 20000;

export function rowFromDrive(f, sectionKey, parentId, path) {
  const ap = f.appProperties || {};
  const isFolder = f.mimeType === FOLDER_MIME ? 1 : 0;
  return {
    drive_id: f.id, section_key: sectionKey, parent_id: parentId, path, name: f.name, mime_type: f.mimeType,
    is_folder: isFolder, size: f.size ? Number(f.size) : null, md5: f.md5Checksum || null,
    created_time: f.createdTime || null, modified_time: f.modifiedTime || null,
    evidence_date: ap.sjlDate || (f.createdTime ? f.createdTime.slice(0, 10) : null),
    evidence_type: isFolder ? null : (ap.sjlType || inferEvidenceType(f.mimeType, f.name)),
    type_inferred: ap.sjlType ? 0 : 1,
    description: f.description || null, web_view_link: f.webViewLink || null,
    has_thumbnail: f.hasThumbnail || f.thumbnailLink ? 1 : 0, synced_at: now(),
  };
}

const UPSERT = `INSERT INTO files (drive_id, section_key, parent_id, path, name, mime_type, is_folder, size, md5, created_time, modified_time,
  evidence_date, evidence_type, type_inferred, description, web_view_link, has_thumbnail, synced_at)
  VALUES (:drive_id, :section_key, :parent_id, :path, :name, :mime_type, :is_folder, :size, :md5, :created_time, :modified_time,
  :evidence_date, :evidence_type, :type_inferred, :description, :web_view_link, :has_thumbnail, :synced_at)
  ON CONFLICT(drive_id) DO UPDATE SET section_key=excluded.section_key, parent_id=excluded.parent_id, path=excluded.path, name=excluded.name,
  mime_type=excluded.mime_type, is_folder=excluded.is_folder, size=excluded.size, md5=excluded.md5, created_time=excluded.created_time,
  modified_time=excluded.modified_time, evidence_date=excluded.evidence_date, evidence_type=excluded.evidence_type, type_inferred=excluded.type_inferred,
  description=excluded.description, web_view_link=excluded.web_view_link, has_thumbnail=excluded.has_thumbnail, synced_at=excluded.synced_at`;

export function upsertRow(row) { db.prepare(UPSERT).run(row); }

const running = new Map();
export function syncSection(key) {
  if (running.has(key)) return running.get(key);
  const p = doSync(key).finally(() => running.delete(key));
  running.set(key, p);
  return p;
}

async function doSync(key) {
  const sec = db.prepare('SELECT * FROM sections WHERE key = ?').get(key);
  if (!sec) throw new AppError(404, 'NO_SECTION', 'القسم غير موجود');
  if (!sec.folder_id) return { key, skipped: true };
  const rows = [];
  const queue = [{ id: sec.folder_id, path: sec.folder_name || sec.title, depth: 0 }];
  while (queue.length) {
    const cur = queue.shift();
    const kids = await listChildren(cur.id);
    for (const f of kids) {
      rows.push(rowFromDrive(f, key, cur.id, cur.path));
      if (f.mimeType === FOLDER_MIME && cur.depth < MAX_DEPTH) queue.push({ id: f.id, path: `${cur.path} / ${f.name}`, depth: cur.depth + 1 });
      if (rows.length > MAX_ITEMS) throw new AppError(413, 'TOO_MANY', 'عدد الملفات في القسم كبير جدًا للفهرسة');
    }
  }
  tx(() => {
    const seen = new Set(rows.map((r) => r.drive_id));
    const existing = db.prepare('SELECT drive_id FROM files WHERE section_key = ?').all(key);
    const del = db.prepare('DELETE FROM files WHERE drive_id = ?');
    for (const e of existing) if (!seen.has(e.drive_id)) del.run(e.drive_id);
    const up = db.prepare(UPSERT);
    for (const r of rows) up.run(r);
    db.prepare('UPDATE sections SET last_sync = ? WHERE key = ?').run(now(), key);
  });
  return { key, files: rows.filter((r) => !r.is_folder).length, folders: rows.filter((r) => r.is_folder).length };
}

export async function syncAll() {
  const keys = db.prepare('SELECT key FROM sections WHERE folder_id IS NOT NULL ORDER BY sort_order').all().map((r) => r.key);
  const results = [];
  for (const k of keys) {
    try { results.push(await syncSection(k)); } catch (e) { results.push({ key: k, error: e.message }); }
  }
  setSetting('last_sync_all', now());
  return results;
}

// يتحقق من أن معرّف المجلد هو مجلد القسم أو مجلد فرعي مفهرس داخله، ويعيد مساره
export function folderPathInSection(key, folderId) {
  const sec = db.prepare('SELECT folder_id, folder_name, title FROM sections WHERE key = ?').get(key);
  if (!sec?.folder_id) throw new AppError(409, 'NOT_MAPPED', 'هذا القسم غير مرتبط بمجلد في Google Drive بعد');
  if (!folderId || folderId === sec.folder_id) return { id: sec.folder_id, path: sec.folder_name || sec.title };
  const f = db.prepare('SELECT drive_id, path, name FROM files WHERE drive_id = ? AND section_key = ? AND is_folder = 1').get(folderId, key);
  if (!f) throw new AppError(400, 'FOLDER_OUTSIDE', 'المجلد المحدد لا يتبع هذا القسم');
  return { id: f.drive_id, path: `${f.path} / ${f.name}` };
}

// تسجيل ملف جديد في الفهرس بعد رفعه أو إنشائه (مع التحقق من مكانه الفعلي في Drive)
export async function indexNewItem(key, driveFileOrId, parentId) {
  const f = typeof driveFileOrId === 'string' ? await getFile(driveFileOrId) : driveFileOrId;
  const parent = (f.parents && f.parents[0]) || parentId;
  const loc = folderPathInSection(key, parent);
  const row = rowFromDrive(f, key, loc.id, loc.path);
  upsertRow(row);
  return row;
}
