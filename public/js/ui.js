// أدوات الواجهة: الاتصال بالخادم، الأيقونات، النوافذ، التنسيق
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export class ApiError extends Error { constructor(status, body) { super(body?.error?.message || `خطأ ${status}`); this.status = status; this.code = body?.error?.code; this.body = body?.error || {}; } }

export async function api(method, path, body, opts = {}) {
  const headers = { 'X-Requested-With': 'sjl', ...(opts.headers || {}) };
  let payload = body;
  if (body !== undefined && !(body instanceof Blob) && !(body instanceof ArrayBuffer)) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  let r;
  try { r = await fetch(path, { method, headers, body: payload, credentials: 'same-origin', signal: opts.signal }); } catch (e) {
    if (e.name === 'AbortError') throw e;
    throw new ApiError(0, { error: { code: 'OFFLINE', message: 'تعذر الاتصال بالخادم. تحققي من الإنترنت.' } });
  }
  const ct = r.headers.get('content-type') || '';
  const data = ct.includes('json') ? await r.json().catch(() => null) : null;
  if (!r.ok) {
    const err = new ApiError(r.status, data);
    if (r.status === 401 && !opts.allow401) { location.hash = '#/login'; }
    throw err;
  }
  return data;
}

// ---------- الأيقونات (SVG خطية) ----------
const P = {
  home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
  dash: '<rect x="3" y="3" width="7" height="9" rx="2"/><rect x="14" y="3" width="7" height="5" rx="2"/><rect x="14" y="12" width="7" height="9" rx="2"/><rect x="3" y="16" width="7" height="5" rx="2"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  report: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6M9 9h2"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  robot: '<rect x="4" y="8" width="16" height="12" rx="3"/><path d="M12 4v4M9 13h.01M15 13h.01M9 17h6M2 13v3M22 13v3"/><circle cx="12" cy="3.5" r="1"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  folderPlus: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M12 11v5M9.5 13.5h5"/>',
  sync: '<path d="M21 12a9 9 0 0 1-15.4 6.4L3 16M3 12a9 9 0 0 1 15.4-6.4L21 8"/><path d="M21 3v5h-5M3 21v-5h5"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  download: '<path d="M12 4v12M7 11l5 5 5-5"/><path d="M4 20h16"/>',
  link: '<path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13 7l4 4"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  external: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  logout: '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l-5-5 5-5M5 12h11"/>',
  check: '<path d="M5 12l5 5 9-10"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  alert: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18h.01"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5h.01"/>',
  file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
  sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
  print: '<path d="M7 9V3h10v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M7 14h10v7H7z"/>',
  cloud: '<path d="M7 18a5 5 0 0 1-.5-10A6 6 0 0 1 18 9a4.5 4.5 0 0 1-.5 9z"/>',
  chevron: '<path d="M15 6l-6 6 6 6"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  db: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>',
  // أيقونات الأقسام
  badge: '<rect x="4" y="3" width="16" height="18" rx="3"/><circle cx="12" cy="10" r="3"/><path d="M8 17c1-2 2.4-3 4-3s3 1 4 3"/>',
  plan: '<rect x="3" y="4" width="18" height="17" rx="2.5"/><path d="M3 9h18M8 2v4M16 2v4M7 13h4M7 17h7"/>',
  class: '<rect x="3" y="4" width="18" height="11" rx="2"/><path d="M7 19h10M12 15v4M7 8h6M7 11h4"/>',
  network: '<circle cx="12" cy="5" r="2.5"/><circle cx="5" cy="18" r="2.5"/><circle cx="19" cy="18" r="2.5"/><path d="M12 7.5v4M12 11.5L6.5 16M12 11.5l5.5 4.5"/>',
  bulb: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.8.8 1 1.6 1 2.5h6c0-.9.2-1.7 1-2.5A6 6 0 0 0 12 3z"/>',
  chat: '<path d="M4 5h16v11H9l-5 4z"/><path d="M8 9h8M8 12h5"/>',
  growth: '<path d="M3 20h18"/><path d="M5 16l5-5 3 3 6-7"/><path d="M15 7h4v4"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  school: '<path d="M3 10l9-6 9 6"/><path d="M5 10v10h14V10M9 20v-5h6v5"/><circle cx="12" cy="10" r="1.6"/>',
  pdf: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
};
export const icon = (name, cls = '') => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || P.file}</svg>`;

export const SECTION_COLORS = [
  ['#4F7BFF', '#2A47D8', '#E6EDFF'], ['#8B73FF', '#5B44C9', '#EFEBFF'], ['#3CC3F5', '#1B8FD0', '#E3F6FE'], ['#5E8BFF', '#3B5BDB', '#E7EEFF'],
  ['#A07BFF', '#6C4BD8', '#F1ECFF'], ['#3DD1E0', '#1597B5', '#E1F8FB'], ['#4C9BFF', '#2563EB', '#E4F0FF'], ['#7E8CFF', '#4B57D6', '#ECEEFF'],
  ['#56B8FF', '#2B7FD8', '#E5F3FF'], ['#9A86FF', '#6A55E0', '#F0EDFF'], ['#46A6FF', '#3557E8', '#E4EEFF'],
];
export const ico3d = (name, idx = 0, size = '') => { const c = SECTION_COLORS[idx % SECTION_COLORS.length]; return `<span class="ico3d ${size}" style="--c1:${c[0]};--c2:${c[1]}">${icon(name)}</span>`; };

// ---------- أنواع الملفات ----------
export function fileKind(mime = '', name = '') {
  if (mime === 'application/vnd.google-apps.folder') return { k: 'folder', label: 'مجلد', color: '#E8A20C', group: 'folder' };
  if (mime.startsWith('image/')) return { k: 'image', label: 'صورة', color: '#12A36B', group: 'image' };
  if (mime.startsWith('video/')) return { k: 'video', label: 'فيديو', color: '#D93B4E', group: 'video' };
  if (mime.startsWith('audio/')) return { k: 'audio', label: 'صوت', color: '#C2410C', group: 'other' };
  if (mime === 'application/pdf') return { k: 'pdf', label: 'PDF', color: '#E0353B', group: 'pdf' };
  if (/wordprocessing|msword|google-apps.document/.test(mime) || /\.docx?$/i.test(name)) return { k: 'doc', label: 'مستند', color: '#2A55E8', group: 'doc' };
  if (/spreadsheet|ms-excel|csv/.test(mime) || /\.xlsx?$/i.test(name)) return { k: 'sheet', label: 'جدول', color: '#0F9D58', group: 'sheet' };
  if (/presentation|powerpoint/.test(mime) || /\.pptx?$/i.test(name)) return { k: 'slides', label: 'عرض', color: '#E37400', group: 'slides' };
  if (mime.startsWith('text/')) return { k: 'text', label: 'نص', color: '#475569', group: 'doc' };
  return { k: 'file', label: 'ملف', color: '#64748B', group: 'other' };
}
export function fileGlyph(mime, name) {
  const f = fileKind(mime, name);
  const ext = { pdf: 'PDF', doc: 'DOC', sheet: 'XLS', slides: 'PPT', video: '▶', image: 'IMG', text: 'TXT', audio: '♪', file: (name.split('.').pop() || '').slice(0, 4).toUpperCase() }[f.k] || '';
  return `<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M12 4h17l11 11v27a2 2 0 0 1-2 2H12a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" fill="#fff" stroke="${f.color}" stroke-width="2"/><path d="M29 4v11h11" fill="${f.color}" opacity=".18"/><rect x="6" y="24" width="30" height="13" rx="3" fill="${f.color}"/><text x="21" y="33.6" text-anchor="middle" font-size="8.5" font-weight="800" fill="#fff" font-family="Tajawal, sans-serif">${esc(ext)}</text></svg>`;
}

// ---------- التنسيق ----------
const hijriFmt = new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura-nu-latn', { day: 'numeric', month: 'short', year: 'numeric' });
const gregFmt = new Intl.DateTimeFormat('ar-EG-u-nu-latn', { day: 'numeric', month: 'short', year: 'numeric' });
export const hijri = (d) => { if (!d) return '—'; try { return hijriFmt.format(new Date(d)); } catch { return d; } };
export const greg = (d) => { if (!d) return '—'; try { return gregFmt.format(new Date(d)); } catch { return d; } };
export const dateTime = (ms) => ms ? new Date(ms).toLocaleString('ar-SA-u-nu-latn-ca-gregory', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
export function bytes(n) {
  if (n === null || n === undefined) return '—';
  const u = ['بايت', 'ك.ب', 'م.ب', 'ج.ب', 'ت.ب']; let i = 0; let v = Number(n);
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${u[i]}`;
}
export const num = (n) => Number(n || 0).toLocaleString('en-US');

// ---------- الإشعارات والنوافذ ----------
export function toast(msg, type = '') {
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = `${icon(type === 'bad' ? 'alert' : type === 'ok' ? 'check' : 'info')}<span>${esc(msg)}</span>`;
  $('#toasts').appendChild(t);
  setTimeout(() => t.remove(), type === 'bad' ? 6000 : 3500);
}
export const toastErr = (e) => toast(e?.message || 'حدث خطأ', 'bad');

export function modal({ title, body, foot = '', wide = false, onClose }) {
  const root = $('#modal-root');
  const ov = document.createElement('div');
  ov.className = 'overlay';
  ov.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <div class="modal-head"><h3>${esc(title)}</h3><button class="btn icon ghost" data-close aria-label="إغلاق">${icon('x')}</button></div>
    <div class="modal-body">${body}</div>${foot ? `<div class="modal-foot">${foot}</div>` : ''}</div>`;
  const close = () => { ov.remove(); document.removeEventListener('keydown', onKey); onClose?.(); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  ov.addEventListener('click', (e) => { if (e.target === ov || e.target.closest('[data-close]')) close(); });
  document.addEventListener('keydown', onKey);
  root.appendChild(ov);
  setTimeout(() => $('input:not([type=hidden]), select, textarea', ov)?.focus(), 50);
  return { el: ov, close };
}

export function confirmDialog({ title, message, ok = 'تأكيد', danger = false }) {
  return new Promise((resolve) => {
    let done = false;
    const m = modal({
      title, body: `<p style="margin:0">${message}</p>`,
      foot: `<button class="btn ${danger ? 'solid-danger' : 'primary'}" data-ok>${esc(ok)}</button><button class="btn" data-close>إلغاء</button>`,
      onClose: () => { if (!done) resolve(false); },
    });
    $('[data-ok]', m.el).onclick = () => { done = true; m.close(); resolve(true); };
  });
}

export function promptDialog({ title, label, value = '', ok = 'حفظ' }) {
  return new Promise((resolve) => {
    let done = false;
    const m = modal({
      title, body: `<label class="f">${esc(label)}<input class="input" data-v value="${esc(value)}"></label>`,
      foot: `<button class="btn primary" data-ok>${esc(ok)}</button><button class="btn" data-close>إلغاء</button>`,
      onClose: () => { if (!done) resolve(null); },
    });
    const input = $('[data-v]', m.el);
    const submit = () => { done = true; const v = input.value.trim(); m.close(); resolve(v || null); };
    $('[data-ok]', m.el).onclick = submit;
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
  });
}

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch {
    const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select();
    const ok = document.execCommand('copy'); ta.remove(); return ok;
  }
}
