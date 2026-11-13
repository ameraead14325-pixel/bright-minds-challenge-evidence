-- مخطط قاعدة بيانات منصة سجل شواهد الأداء الوظيفي 1448هـ (SQLite)
-- الملفات نفسها تبقى في Google Drive؛ هنا فقط الإعدادات والربط والفهرسة والسجلات.

-- إعدادات عامة (key/value بصيغة JSON): بيانات الترويسة، المجلد الرئيسي، آخر مزامنة...
CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

-- الأقسام (المعايير) الإحدى عشرة وربط كل منها بمعرّف مجلد Drive
CREATE TABLE IF NOT EXISTS sections (
  key          TEXT PRIMARY KEY,
  sort_order   INTEGER NOT NULL,
  title        TEXT NOT NULL,
  folder_id    TEXT UNIQUE,          -- Folder ID في Google Drive (لا يُربط مجلد بقسمين)
  folder_name  TEXT,
  target_count INTEGER NOT NULL DEFAULT 5, -- العدد المستهدف من الشواهد لحساب نسبة الاكتمال
  last_sync    INTEGER
);

-- فهرس الملفات والمجلدات الفرعية داخل مجلدات الأقسام (نسخة وصفية فقط، بلا محتوى)
CREATE TABLE IF NOT EXISTS files (
  drive_id       TEXT PRIMARY KEY,   -- يمنع تكرار الملف الواحد في الفهرس
  section_key    TEXT NOT NULL REFERENCES sections(key) ON DELETE CASCADE,
  parent_id      TEXT NOT NULL,
  path           TEXT NOT NULL,      -- مسار المجلد داخل القسم
  name           TEXT NOT NULL,
  mime_type      TEXT NOT NULL,
  is_folder      INTEGER NOT NULL DEFAULT 0,
  size           INTEGER,
  md5            TEXT,
  created_time   TEXT,
  modified_time  TEXT,
  evidence_date  TEXT,
  evidence_type  TEXT,
  type_inferred  INTEGER NOT NULL DEFAULT 1,
  description    TEXT,
  web_view_link  TEXT,
  has_thumbnail  INTEGER NOT NULL DEFAULT 0,
  synced_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_files_section ON files(section_key, is_folder);
CREATE INDEX IF NOT EXISTS idx_files_created ON files(created_time);

-- المستخدمون المسموح لهم (المالكة من OWNER_EMAIL، والمطّلعون يضافون من الإعدادات)
CREATE TABLE IF NOT EXISTS users (
  email      TEXT PRIMARY KEY,
  name       TEXT,
  role       TEXT NOT NULL CHECK (role IN ('owner','viewer')),
  last_login INTEGER,
  created_at INTEGER NOT NULL
);

-- الجلسات (يُخزَّن تجزئة SHA-256 لمعرّف الجلسة فقط)
CREATE TABLE IF NOT EXISTS sessions (
  id_hash    TEXT PRIMARY KEY,
  email      TEXT NOT NULL,
  role       TEXT NOT NULL,
  name       TEXT,
  picture    TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

-- حالة OAuth المؤقتة (حماية من CSRF في مسار تسجيل الدخول)
CREATE TABLE IF NOT EXISTS oauth_states (
  state      TEXT PRIMARY KEY,
  purpose    TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- رموز Google لحساب المالكة — مشفّرة AES-256-GCM
CREATE TABLE IF NOT EXISTS google_tokens (
  id                INTEGER PRIMARY KEY CHECK (id = 1),
  email             TEXT NOT NULL,
  refresh_token_enc TEXT NOT NULL,
  access_token_enc  TEXT,
  expiry            INTEGER,
  scope             TEXT,
  connected_at      INTEGER NOT NULL,
  needs_reauth      INTEGER NOT NULL DEFAULT 0
);

-- جلسات الرفع القابلة للاستئناف (رابط الجلسة لدى Google مشفّر)
CREATE TABLE IF NOT EXISTS uploads (
  id              TEXT PRIMARY KEY,
  section_key     TEXT NOT NULL,
  parent_id       TEXT NOT NULL,
  name            TEXT NOT NULL,
  size            INTEGER NOT NULL,
  mime_type       TEXT,
  session_uri_enc TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'active', -- active | done | failed
  drive_file_id   TEXT,
  created_by      TEXT NOT NULL,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);

-- سجل العمليات الأساسية
CREATE TABLE IF NOT EXISTS audit_log (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  at      INTEGER NOT NULL,
  email   TEXT,
  action  TEXT NOT NULL,
  target  TEXT,
  details TEXT
);
CREATE INDEX IF NOT EXISTS idx_audit_at ON audit_log(at);
