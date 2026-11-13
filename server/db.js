import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { config, ROOT } from './config.js';
import { SECTIONS, DEFAULT_PROFILE } from './sections.js';

fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
export const db = new DatabaseSync(config.dbPath);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
db.exec(fs.readFileSync(path.join(ROOT, 'db', 'schema.sql'), 'utf8'));

// إدراج الأقسام الإحدى عشرة إن لم تكن موجودة
const ins = db.prepare('INSERT OR IGNORE INTO sections (key, sort_order, title) VALUES (?, ?, ?)');
SECTIONS.forEach((s, i) => ins.run(s.key, i + 1, s.title));

export const now = () => Date.now();

export function getSetting(key, fallback = null) {
  const r = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  if (!r) return fallback;
  try { return JSON.parse(r.value); } catch { return fallback; }
}
export function setSetting(key, value) {
  db.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at')
    .run(key, JSON.stringify(value), now());
}
export const getProfile = () => ({ ...DEFAULT_PROFILE, ...(getSetting('profile', {}) || {}) });

export function tx(fn) {
  db.exec('BEGIN IMMEDIATE');
  try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; }
}

export function audit(email, action, target = null, details = null) {
  db.prepare('INSERT INTO audit_log (at, email, action, target, details) VALUES (?, ?, ?, ?, ?)')
    .run(now(), email || null, action, target, details ? JSON.stringify(details) : null);
}

// تنظيف دوري للجلسات المنتهية وحالات OAuth القديمة
export function cleanup() {
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(now());
  db.prepare('DELETE FROM oauth_states WHERE created_at < ?').run(now() - 15 * 60 * 1000);
  db.prepare("DELETE FROM uploads WHERE status != 'done' AND updated_at < ?").run(now() - 7 * 864e5);
  db.prepare('DELETE FROM audit_log WHERE at < ?').run(now() - 400 * 864e5);
}
