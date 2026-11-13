// منصة سجل شواهد الأداء الوظيفي 1448هـ — الواجهة
import { api, esc, $, $$, icon, ico3d, fileKind, fileGlyph, hijri, greg, dateTime, bytes, num, toast, toastErr, modal, confirmDialog, promptDialog, copyText, SECTION_COLORS } from './ui.js';
import { openUploadModal } from './upload.js';

const S = {
  me: null, sections: [], files: new Map(),
  view: localStorage.getItem('sjl_view') || 'grid', fview: localStorage.getItem('sjl_fview') || 'grid',
};
const app = $('#app');
const isOwner = () => S.me?.user.role === 'owner';
const secIndex = (key) => S.sections.findIndex((s) => s.key === key);
const driveFolderUrl = (id) => `https://drive.google.com/drive/folders/${encodeURIComponent(id)}`;
const drivePreviewUrl = (id) => `https://drive.google.com/file/d/${encodeURIComponent(id)}/preview`;

function parseHash() {
  const h = location.hash.replace(/^#\/?/, '');
  const [p, qs] = h.split('?');
  const parts = p.split('/');
  return { name: parts[0] || '', arg: parts[1] ? decodeURIComponent(parts[1]) : null, q: new URLSearchParams(qs || '') };
}
const go = (hash) => { if (location.hash === hash) route(); else location.hash = hash; };

// ======================= الرسومات =======================
const HERO_ART = `<svg class="hero-art" viewBox="0 0 220 170" aria-hidden="true">
  <defs><linearGradient id="hb" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset="1" stop-color="#DDE6FF"/></linearGradient>
  <linearGradient id="hv" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#A9F0FF"/><stop offset="1" stop-color="#6FB8FF"/></linearGradient></defs>
  <circle cx="150" cy="78" r="64" fill="#fff" opacity=".08"/><circle cx="150" cy="78" r="44" fill="#fff" opacity=".08"/>
  <g stroke="#fff" stroke-opacity=".35" stroke-width="1.4" fill="none"><path d="M20 140h40l12-12h30"/><path d="M14 40h26l10 10h18"/><circle cx="104" cy="128" r="3" fill="#fff"/><circle cx="70" cy="50" r="3" fill="#fff"/></g>
  <g transform="translate(116 30)"><rect x="6" y="18" width="60" height="50" rx="16" fill="url(#hb)"/><rect x="16" y="30" width="40" height="22" rx="10" fill="#1A36A6"/>
  <circle cx="28" cy="41" r="4.5" fill="url(#hv)"/><circle cx="44" cy="41" r="4.5" fill="url(#hv)"/><path d="M36 18V8" stroke="#fff" stroke-width="3" stroke-linecap="round"/><circle cx="36" cy="6" r="5" fill="#7EE3FF"/>
  <rect x="0" y="34" width="8" height="18" rx="4" fill="#DDE6FF"/><rect x="64" y="34" width="8" height="18" rx="4" fill="#DDE6FF"/>
  <rect x="14" y="70" width="44" height="40" rx="12" fill="url(#hb)"/><circle cx="36" cy="88" r="7" fill="#7A62E8"/><path d="M33 88l2.5 2.5 4.5-5" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round"/></g>
  <g transform="translate(30 92)"><path d="M0 8c18-8 34-8 46 0v46C34 46 18 46 0 54z" fill="#fff" opacity=".95"/><path d="M92 8C74 0 58 0 46 8v46c12-8 28-8 46 0z" fill="#E3EAFF"/>
  <path d="M10 20h26M10 28h22M56 20h26M56 28h20" stroke="#7A8FD6" stroke-width="2.4" stroke-linecap="round"/><circle cx="70" cy="40" r="5" fill="#7EE3FF"/></g></svg>`;

const LOGIN_ART = `<svg class="art" viewBox="0 0 320 220" aria-hidden="true"><g fill="none" stroke="#fff" stroke-opacity=".3" stroke-width="1.5"><rect x="20" y="30" width="180" height="120" rx="14"/><path d="M20 60h180M50 30v-10M170 30v-10"/><path d="M40 85h60M40 105h90M40 125h40"/></g>
<g transform="translate(180 60)"><rect x="10" y="20" width="90" height="74" rx="24" fill="#fff"/><rect x="24" y="38" width="62" height="32" rx="14" fill="#1A36A6"/><circle cx="42" cy="54" r="6" fill="#7EE3FF"/><circle cx="68" cy="54" r="6" fill="#7EE3FF"/><path d="M55 20V6" stroke="#fff" stroke-width="4" stroke-linecap="round"/><circle cx="55" cy="5" r="6" fill="#A9F0FF"/><rect x="24" y="98" width="62" height="54" rx="16" fill="#E3EAFF"/><path d="M44 124l8 8 16-16" stroke="#7A62E8" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></g>
<g transform="translate(30 160)"><path d="M0 10c26-10 48-10 66 0v40C48 40 26 40 0 50z" fill="#fff"/><path d="M132 10c-26-10-48-10-66 0v40c18-10 40-10 66 0z" fill="#C9D6FF"/></g></svg>`;

const GOOGLE_G = `<svg viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>`;

// ======================= الدخول =======================
function renderLogin(q) {
  const p = S.me?.profile || { platformName: 'سجل شواهد الأداء الوظيفي 1448هـ', teacher: 'أ. فاطمة محمد', specialty: 'معلمة العلوم', school: 'الابتدائية الثامنة والعشرون بتبوك', authority: 'إدارة تعليم تبوك', year: '1448هـ' };
  const err = q.get('error');
  app.innerHTML = `<main class="login"><div class="login-card">
    <section class="login-art"><div><img src="/assets/logo.svg" width="54" alt=""><h1>${esc(p.platformName)}</h1><p>منصة ذكية لتنظيم شواهد الأداء الوظيفي وحفظها في Google Drive الخاص بالمعلمة.</p></div>${LOGIN_ART}
      <div class="small" style="opacity:.8">${esc(p.authority)} — العام الدراسي ${esc(p.year)}</div></section>
    <section class="login-form">
      <h2>مرحبًا بك 👋</h2>
      <p class="muted" style="margin:0">سجّلي الدخول بحساب Google المصرّح له. صاحبة المنصة تربط Drive من الإعدادات بعد الدخول، والمطّلعون (مثل مديرة المدرسة) يرون الشواهد دون تعديل.</p>
      ${err ? `<div class="alert bad">${icon('alert')}<div>${esc(err)}</div></div>` : ''}
      <a class="gbtn" href="/auth/login">${GOOGLE_G} تسجيل الدخول بحساب Google</a>
      <div class="info-list"><div><b>المعلمة</b>${esc(p.teacher)} — ${esc(p.specialty)}</div><div><b>المدرسة</b>${esc(p.school)}</div></div>
      <p class="muted small" style="margin:0">${icon('shield', 'sr')}تُحفظ ملفاتك في Google Drive الخاص بك فقط. المنصة لا تعرض إلا المجلدات التي تربطينها بها.</p>
    </section></div></main>`;
}

// ======================= الهيكل =======================
const NAV = [
  ['', 'home', 'الرئيسية'], ['dashboard', 'dash', 'لوحة التحكم'], ['search', 'search', 'البحث'],
  ['reports', 'report', 'التقارير'], ['assistant', 'robot', 'المساعد', true], ['settings', 'settings', 'الإعدادات'],
];
function renderShell(active) {
  const u = S.me.user; const p = S.me.profile;
  const nav = NAV.filter((n) => !n[3] || isOwner());
  app.innerHTML = `<div class="shell">
    <header class="topbar">
      <a class="brand" href="#/"><img src="/assets/logo.svg" alt=""><div><b>${esc(p.platformName)}</b><small>${esc(p.teacher)} · ${esc(p.school)}</small></div></a>
      <nav class="nav" aria-label="التنقل">${nav.map(([h, i, t]) => `<a href="#/${h}" class="${active === h ? 'on' : ''}" title="${t}">${icon(i)}<span>${t}</span></a>`).join('')}</nav>
      <div class="user-chip">${u.picture ? `<img src="${esc(u.picture)}" alt="" referrerpolicy="no-referrer">` : `<span class="av">${esc((u.name || u.email)[0])}</span>`}<span>${esc(u.name || u.email)}</span><span class="role ${u.role}">${u.role === 'owner' ? 'المالكة' : 'مطّلعة'}</span>
      <button class="btn icon ghost sm" data-logout title="تسجيل الخروج" aria-label="تسجيل الخروج">${icon('logout')}</button></div>
    </header>
    <div id="view"></div>
  </div>
  <nav class="bottom-nav" aria-label="التنقل">${nav.map(([h, i, t]) => `<a href="#/${h}" class="${active === h ? 'on' : ''}">${icon(i)}${t}</a>`).join('')}</nav>`;
  $('[data-logout]').onclick = async () => { await api('POST', '/auth/logout').catch(() => {}); location.hash = '#/login'; location.reload(); };
  return $('#view');
}

function officialHeader() {
  const p = S.me.profile;
  return `<section class="official"><div class="official-in"><div>
    <h1>${esc(p.platformName)}</h1><div class="sub">${esc(p.authority)} · العام الدراسي ${esc(p.year)}</div>
    <div class="meta-grid">
      <div><span>اسم المعلمة</span><b>${esc(p.teacher)}</b></div><div><span>التخصص</span><b>${esc(p.specialty)}</b></div><div><span>المدرسة</span><b>${esc(p.school)}</b></div>
      <div><span>مديرة المدرسة</span><b>${esc(p.principal)}</b></div><div><span>الجهة التعليمية</span><b>${esc(p.authority)}</b></div><div><span>العام الدراسي</span><b>${esc(p.year)}</b></div>
    </div></div>${HERO_ART}</div></section>`;
}

function setupNotice() {
  const me = S.me;
  if (isOwner() && me.serverProblems.length) return `<div class="alert bad" style="margin-top:16px">${icon('alert')}<div><b>إعداد الخادم غير مكتمل</b><div class="small">${me.serverProblems.map(esc).join('، ')}</div></div></div>`;
  if (!me.drive.connected) {
    if (!isOwner()) return `<div class="alert info" style="margin-top:16px">${icon('info')}<div>لم تربط المعلمة حساب Google Drive بعد، أو يحتاج الربط إلى تجديد. ستظهر الشواهد هنا فور الربط.</div></div>`;
    return `<div class="alert" style="margin-top:16px">${icon('cloud')}<div style="flex:1"><b>${me.drive.needsReauth ? 'يحتاج الربط مع Google Drive إلى تجديد' : 'الخطوة الأولى: ربط حساب Google Drive'}</b><div class="small">تُخزَّن جميع الشواهد في حسابك على Google Drive. اربطي حسابك ثم اختاري مجلد سجل الشواهد الرئيسي.</div></div><a class="btn primary" href="/auth/connect-drive">${icon('cloud')} ربط حساب Google Drive</a></div>`;
  }
  if (isOwner() && (!me.root || me.mappedCount < 11)) return `<div class="alert info" style="margin-top:16px">${icon('folder')}<div style="flex:1"><b>${!me.root ? 'اختاري مجلد سجل الشواهد الرئيسي' : `تم ربط ${me.mappedCount} من 11 قسمًا`}</b><div class="small">اربطي كل معيار بمجلده في Drive لتظهر شواهده في القسم الصحيح.</div></div><a class="btn primary" href="#/settings">إكمال الربط</a></div>`;
  return '';
}

// ======================= بطاقات الأقسام =======================
function sectionCard(s, i) {
  const c = SECTION_COLORS[i % SECTION_COLORS.length];
  const status = !s.folderId ? '<span class="badge warn">غير مرتبط</span>' : s.completion >= 100 ? '<span class="badge ok">مكتمل</span>' : s.count === 0 ? '<span class="badge bad">بلا شواهد</span>' : '<span class="badge">قيد التوثيق</span>';
  return `<a class="sec-card" href="#/section/${s.key}" style="--tint:${c[2]}" aria-label="${esc(s.title)}">
    <div class="sec-top">${ico3d(s.icon, i)}<span class="sec-num">${String(s.order).padStart(2, '0')}</span></div>
    <h3>${esc(s.title)}</h3>
    <div class="sec-stats"><span><b>${num(s.count)}</b> شاهد من ${s.targetCount}</span><span>${s.completion}%</span></div>
    <div class="progress ${s.completion >= 100 ? 'ok' : ''}"><i style="width:${s.completion}%"></i></div>
    <div class="sec-foot">${status}<span class="spacer"></span><span class="muted">${s.latest ? 'آخر إضافة ' + hijri(s.latest) : ''}</span></div>
  </a>`;
}

async function loadSections() { S.sections = await api('GET', '/api/sections'); return S.sections; }

async function viewHome(v) {
  v.innerHTML = `${officialHeader()}${setupNotice()}
    <div class="page-head"><div><h2>معايير الأداء الوظيفي</h2><p>أحد عشر معيارًا — انقري على أي معيار لإدارة شواهده</p></div></div>
    <div class="toolbar">
      <form class="search-box" data-gsearch>${icon('search')}<input class="input" name="q" placeholder="بحث شامل في جميع الأقسام…" aria-label="بحث شامل"></form>
      <div class="seg" role="group" aria-label="طريقة العرض"><button data-view="grid" class="${S.view === 'grid' ? 'on' : ''}" title="عرض شبكي">${icon('grid')}</button><button data-view="list" class="${S.view === 'list' ? 'on' : ''}" title="عرض قائمة">${icon('list')}</button></div>
      ${S.me.drive.connected ? `<button class="btn" data-syncall>${icon('sync')} مزامنة الكل</button>` : ''}
    </div>
    <div class="stats" id="home-stats"></div>
    <div class="sections ${S.view}" id="sec-grid" style="margin-top:16px"><div class="boot" style="min-height:200px;grid-column:1/-1"><div class="spinner"></div></div></div>`;
  $('[data-gsearch]', v).onsubmit = (e) => { e.preventDefault(); go(`#/search?q=${encodeURIComponent(e.target.q.value.trim())}`); };
  $$('[data-view]', v).forEach((b) => b.onclick = () => { S.view = b.dataset.view; localStorage.setItem('sjl_view', S.view); $$('[data-view]', v).forEach((x) => x.classList.toggle('on', x === b)); $('#sec-grid').className = `sections ${S.view}`; });
  const draw = () => {
    const total = S.sections.reduce((a, s) => a + s.count, 0);
    const mapped = S.sections.filter((s) => s.folderId).length;
    const overall = Math.round(S.sections.reduce((a, s) => a + s.completion, 0) / 11);
    $('#home-stats').innerHTML = [
      ['report', 'إجمالي الشواهد', num(total), 0], ['folder', 'الأقسام المرتبطة', `${mapped} / 11`, 2],
      ['growth', 'نسبة الاكتمال العامة', `${overall}%`, 1], ['sync', 'آخر مزامنة', S.me.lastSyncAll ? hijri(S.me.lastSyncAll) : '—', 5],
    ].map(([ic, l, n, ci], i) => `<div class="card stat">${ico3d(ic, ci, 'sm')}<div><div class="num ${i === 3 ? 'txt' : ''}">${n}</div><div class="lbl">${l}</div></div></div>`).join('');
    $('#sec-grid').innerHTML = S.sections.map(sectionCard).join('');
  };
  await loadSections(); draw();
  const syncAll = async (btn) => {
    if (btn) { btn.disabled = true; btn.innerHTML = `${icon('sync')} جارٍ المزامنة…`; }
    try {
      const r = await api('POST', '/api/sync');
      const errs = r.filter((x) => x.error);
      S.me.lastSyncAll = Date.now(); await loadSections(); if ($('#sec-grid')) draw();
      if (btn) toast(errs.length ? `تمت المزامنة مع ${errs.length} خطأ` : 'تمت مزامنة جميع الأقسام مع Google Drive', errs.length ? 'bad' : 'ok');
    } catch (e) { if (btn) toastErr(e); } finally { if (btn && btn.isConnected) { btn.disabled = false; btn.innerHTML = `${icon('sync')} مزامنة الكل`; } }
  };
  const sb = $('[data-syncall]', v);
  if (sb) sb.onclick = () => syncAll(sb);
  if (S.me.drive.connected && S.me.mappedCount && (!S.me.lastSyncAll || Date.now() - S.me.lastSyncAll > 10 * 60 * 1000)) syncAll(null);
}

// ======================= عرض الملفات =======================
function fileCard(f, { showSection = false } = {}) {
  const k = fileKind(f.mimeType, f.name);
  const own = isOwner();
  const thumb = f.hasThumbnail ? `<img loading="lazy" src="/api/files/${encodeURIComponent(f.id)}/thumbnail" alt="" data-fallback>` : fileGlyph(f.mimeType, f.name);
  const ev = f.evidenceType && f.evidenceType !== 'غير مصنف' ? `<span class="badge ${f.typeInferred ? '' : 'v'}" title="${f.typeInferred ? 'تصنيف تلقائي' : 'تصنيف يدوي'}">${esc(f.evidenceType)}</span>` : '<span class="badge warn">غير مصنف</span>';
  return `<article class="file" data-id="${esc(f.id)}">
    <button class="thumb" data-act="preview" aria-label="معاينة ${esc(f.name)}">${thumb}</button>
    <div class="file-body">
      <div class="file-name" title="${esc(f.name)}">${esc(f.name)}</div>
      <div class="file-meta">${ev}<span class="ftype" style="color:${k.color}">${k.label}</span><span>${bytes(f.size)}</span><span title="${esc(greg(f.evidenceDate || f.createdTime))}">${hijri(f.evidenceDate || f.createdTime)}</span></div>
      ${showSection ? `<div class="file-meta"><a href="#/section/${f.section}" class="badge">${esc(f.sectionTitle)}</a></div>` : ''}
      <div class="file-path" title="${esc(f.path)}">${icon('folder')}<span>${esc(f.path)}</span></div>
    </div>
    <div class="file-actions">
      <button data-act="preview" title="معاينة">${icon('eye')}</button>
      <button data-act="open" title="فتح في Google Drive">${icon('external')}</button>
      <button data-act="download" title="تنزيل">${icon('download')}</button>
      <button data-act="copy" title="نسخ رابط المشاركة">${icon('link')}</button>
      ${own ? `<button data-act="edit" title="تعديل">${icon('edit')}</button><button data-act="ai" title="مساعد الشواهد">${icon('sparkle')}</button><button data-act="delete" class="del" title="حذف">${icon('trash')}</button>` : ''}
    </div></article>`;
}

function renderFiles(container, files, opts) {
  files.forEach((f) => S.files.set(f.id, f));
  container.className = `files ${S.fview}`;
  container.innerHTML = files.length ? files.map((f) => fileCard(f, opts)).join('') : `<div class="empty" style="grid-column:1/-1">${icon('folder')}<div><b>لا توجد شواهد مطابقة</b></div><div class="small">${opts?.emptyHint || ''}</div></div>`;
  $$('img[data-fallback]', container).forEach((img) => img.onerror = () => { const f = S.files.get(img.closest('.file').dataset.id); img.replaceWith(document.createRange().createContextualFragment(fileGlyph(f.mimeType, f.name))); });
}

function previewFile(f) {
  const k = fileKind(f.mimeType, f.name);
  const src = `/api/files/${encodeURIComponent(f.id)}/content`;
  const isGoogle = f.mimeType.startsWith('application/vnd.google-apps');
  let body;
  if (k.k === 'image') body = `<img class="preview-img" src="${src}" alt="${esc(f.name)}">`;
  else if (k.k === 'video') body = `<video controls style="width:100%;max-height:72vh;border-radius:12px;background:#000" src="${src}"></video>`;
  else if (k.k === 'audio') body = `<audio controls style="width:100%" src="${src}"></audio>`;
  else if (k.k === 'pdf' || isGoogle || k.k === 'text') body = `<iframe class="preview-frame" src="${src}" title="${esc(f.name)}"></iframe>`;
  else body = `<div class="alert info">${icon('info')}<div>تُعرض ملفات ${k.label} (Office) عبر معاينة Google Drive، وتتطلب أن يكون حساب Google المفتوح في المتصفح لديه صلاحية على الملف. يمكنك دائمًا تنزيله أو فتحه في Drive.</div></div><iframe class="preview-frame" src="${drivePreviewUrl(f.id)}" title="${esc(f.name)}" allow="autoplay"></iframe>`;
  const meta = `<div class="row small muted"><span>${icon('folder', 'sr')}المسار: ${esc(f.path)}</span><span>·</span><span>${hijri(f.evidenceDate || f.createdTime)}</span><span>·</span><span>${bytes(f.size)}</span>${f.evidenceType ? `<span class="badge">${esc(f.evidenceType)}</span>` : ''}</div>${f.description ? `<p style="margin:0">${esc(f.description)}</p>` : ''}`;
  modal({ title: f.name, wide: true, body: meta + body, foot: `<a class="btn primary" href="${src}?mode=download">${icon('download')} تنزيل</a>${f.webViewLink ? `<a class="btn" href="${esc(f.webViewLink)}" target="_blank" rel="noopener">${icon('external')} فتح الملف الأصلي في Drive</a>` : ''}<button class="btn" data-close>إغلاق</button>` });
}

function editFile(f, onSaved) {
  const types = S.me.evidenceTypes;
  const m = modal({
    title: 'تعديل بيانات الشاهد',
    body: `<div class="form-grid">
      <label class="f full">اسم الشاهد<div class="row" style="flex-wrap:nowrap"><input class="input" name="name" value="${esc(f.name)}" maxlength="200"><button class="btn violet sm" data-sug="name" type="button" title="اقتراح اسم احترافي">${icon('sparkle')}</button></div></label>
      <label class="f">نوع الشاهد<select class="input" name="ev"><option value="">— تصنيف تلقائي —</option>${types.map((t) => `<option ${t === f.evidenceType && !f.typeInferred ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>
      <label class="f">تاريخ الشاهد<input class="input" type="date" name="date" value="${esc((f.evidenceDate || '').slice(0, 10))}"></label>
      <label class="f full">وصف مختصر<div class="row" style="flex-wrap:nowrap;align-items:flex-start"><textarea class="input" name="desc" rows="3" maxlength="2000">${esc(f.description || '')}</textarea><button class="btn violet sm" data-sug="describe" type="button" title="اقتراح وصف">${icon('sparkle')}</button></div></label>
    </div><p class="muted small" style="margin:0">التعديلات تُحفظ مباشرة على الملف في Google Drive (الاسم والوصف وخصائص التصنيف).</p>`,
    foot: `<button class="btn primary" data-save>${icon('check')} حفظ</button><button class="btn" data-close>إلغاء</button>`,
  });
  $$('[data-sug]', m.el).forEach((b) => b.onclick = async () => {
    b.disabled = true;
    try {
      const r = await api('POST', '/api/assistant', { action: b.dataset.sug, fileId: f.id });
      if (r.suggestedName) $('[name=name]', m.el).value = r.suggestedName;
      if (r.description) $('[name=desc]', m.el).value = r.description;
      toast('اقتراح آلي — راجعيه قبل الحفظ');
    } catch (e) { toastErr(e); } finally { b.disabled = false; }
  });
  $('[data-save]', m.el).onclick = async (e) => {
    e.target.disabled = true;
    try {
      const upd = await api('PATCH', `/api/files/${encodeURIComponent(f.id)}`, { name: $('[name=name]', m.el).value, evidenceType: $('[name=ev]', m.el).value || null, evidenceDate: $('[name=date]', m.el).value || null, description: $('[name=desc]', m.el).value });
      S.files.set(upd.id, upd); m.close(); toast('تم حفظ التعديلات في Google Drive', 'ok'); onSaved?.();
    } catch (err) { toastErr(err); e.target.disabled = false; }
  };
}

function assistantForFile(f, onSaved) {
  const m = modal({
    title: `مساعد شواهد الأداء — ${f.name}`,
    body: `<div class="row">
      <button class="btn soft" data-a="classify">${icon('sparkle')} تصنيف الشاهد</button>
      <button class="btn soft" data-a="name">${icon('edit')} اقتراح اسم</button>
      <button class="btn soft" data-a="describe">${icon('report')} إعداد وصف</button>
      <button class="btn violet" data-a="summarize" ${S.me.aiEnabled ? '' : 'disabled'}>${icon('robot')} تلخيص المحتوى${S.me.aiEnabled ? '' : ' (غير مفعّل)'}</button>
    </div>
    ${S.me.aiEnabled ? '' : '<div class="alert info small">' + icon('info') + '<div>التصنيف والأسماء والأوصاف تعمل بقواعد آلية داخل المنصة. تلخيص محتوى الملفات يتطلب ربط نموذج ذكاء اصطناعي حقيقي (مفتاح ANTHROPIC_API_KEY في الخادم) — غير مربوط حاليًا.</div></div>'}
    <div data-out></div>`,
    foot: '<button class="btn" data-close>إغلاق</button>',
  });
  const out = $('[data-out]', m.el);
  $$('[data-a]', m.el).forEach((b) => b.onclick = async () => {
    out.innerHTML = '<div class="spinner"></div>';
    try {
      const r = await api('POST', '/api/assistant', { action: b.dataset.a, fileId: f.id });
      const tag = r.ai ? `<span class="badge v">ذكاء اصطناعي (${esc(r.model)})</span>` : '<span class="badge">اقتراح بالقواعد</span>';
      let html = `<div class="card solid" style="display:grid;gap:10px">${tag}`;
      if (r.summary) html += `<div><b>التلخيص:</b><p style="margin:4px 0">${esc(r.summary)}</p></div>`;
      if (r.bestSections) html += `<div><b>النوع الحالي:</b> ${esc(r.evidenceType || '—')} ${r.typeInferred ? '(تلقائي)' : ''}</div><div><b>المعايير الأقرب حسب الاسم:</b> ${r.bestSections.length ? r.bestSections.map((s) => `<span class="chip">${esc(s.title)}</span>`).join(' ') : 'لا توجد مؤشرات كافية في اسم الملف'}</div>`;
      if (r.evidenceType && !r.bestSections) html += `<div><b>نوع الشاهد المقترح:</b> ${esc(r.evidenceType)}</div>`;
      if (r.fitsSection === false) html += `<div class="alert small">${icon('alert')}<div>قد يكون الأنسب: ${esc(r.betterSection || 'معيار آخر')}</div></div>`;
      if (r.suggestedName) html += `<div><b>الاسم المقترح:</b><div class="row" style="margin-top:4px"><code style="flex:1">${esc(r.suggestedName)}</code><button class="btn sm primary" data-apply-name="${esc(r.suggestedName)}">اعتماد الاسم</button></div></div>`;
      if (r.description) html += `<div><b>الوصف المقترح:</b><p style="margin:4px 0">${esc(r.description)}</p><button class="btn sm primary" data-apply-desc>اعتماد الوصف</button></div>`;
      out.innerHTML = html + '</div>';
      const an = $('[data-apply-name]', out);
      if (an) an.onclick = async () => { try { await api('PATCH', `/api/files/${encodeURIComponent(f.id)}`, { name: an.dataset.applyName }); toast('تم تغيير الاسم في Drive', 'ok'); onSaved?.(); } catch (e) { toastErr(e); } };
      const ad = $('[data-apply-desc]', out);
      if (ad) ad.onclick = async () => { try { await api('PATCH', `/api/files/${encodeURIComponent(f.id)}`, { description: r.description, ...(r.evidenceType && r.ai ? { evidenceType: r.evidenceType } : {}) }); toast('تم حفظ الوصف في Drive', 'ok'); onSaved?.(); } catch (e) { toastErr(e); } };
    } catch (e) { out.innerHTML = `<div class="alert bad">${icon('alert')}<div>${esc(e.message)}</div></div>`; }
  });
}

function bindFileActions(container, reload) {
  container.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const f = S.files.get(b.closest('.file').dataset.id); if (!f) return;
    const act = b.dataset.act;
    if (act === 'preview') previewFile(f);
    else if (act === 'open') { if (f.webViewLink) window.open(f.webViewLink, '_blank', 'noopener'); }
    else if (act === 'download') { location.href = `/api/files/${encodeURIComponent(f.id)}/content?mode=download`; }
    else if (act === 'copy') { if (await copyText(f.webViewLink || '')) toast('تم نسخ رابط Google Drive — يفتحه من لديه صلاحية على الملف', 'ok'); }
    else if (act === 'edit') editFile(f, reload);
    else if (act === 'ai') assistantForFile(f, reload);
    else if (act === 'delete') {
      const ok = await confirmDialog({ title: 'حذف الشاهد', message: `سيتم نقل «<b>${esc(f.name)}</b>» إلى سلة المهملات في Google Drive (يمكن استرجاعه من سلة Drive خلال 30 يومًا). هل تريدين المتابعة؟`, ok: 'نعم، احذفي الشاهد', danger: true });
      if (!ok) return;
      try { await api('DELETE', `/api/files/${encodeURIComponent(f.id)}`); S.files.delete(f.id); toast('تم نقل الشاهد إلى سلة Drive', 'ok'); reload(); } catch (err) { toastErr(err); }
    }
  });
}

const typeOptions = `<option value="">كل أنواع الملفات</option><option value="pdf">PDF</option><option value="image">صور</option><option value="video">فيديو</option><option value="doc">مستندات</option><option value="sheet">جداول</option><option value="slides">عروض</option><option value="other">أخرى</option>`;
const sortOptions = `<option value="newest">الأحدث أولًا</option><option value="oldest">الأقدم أولًا</option><option value="name">حسب الاسم</option><option value="size">الأكبر حجمًا</option>`;
const evOptions = () => `<option value="">كل أنواع الشواهد</option>${S.me.evidenceTypes.concat('غير مصنف').map((t) => `<option>${esc(t)}</option>`).join('')}`;

function filterBar(q, extra = '') {
  return `<form class="filters" data-filters>
    <label class="search-box">${icon('search')}<input class="input" name="q" value="${esc(q.get('q') || '')}" placeholder="بحث بالاسم أو الوصف أو المسار…" aria-label="بحث"></label>
    ${extra}
    <select class="input" name="type" aria-label="نوع الملف">${typeOptions}</select>
    <select class="input" name="ev" aria-label="نوع الشاهد">${evOptions()}</select>
    <label class="f">من<input class="input" type="date" name="from" value="${esc(q.get('from') || '')}"></label>
    <label class="f">إلى<input class="input" type="date" name="to" value="${esc(q.get('to') || '')}"></label>
    <select class="input" name="sort" aria-label="الترتيب">${sortOptions}</select>
    <div class="seg" role="group" aria-label="طريقة العرض"><button type="button" data-fview="grid" class="${S.fview === 'grid' ? 'on' : ''}" title="شبكي">${icon('grid')}</button><button type="button" data-fview="list" class="${S.fview === 'list' ? 'on' : ''}" title="قائمة">${icon('list')}</button></div>
  </form>`;
}
function bindFilters(v, q, load) {
  const form = $('[data-filters]', v);
  for (const n of ['type', 'ev', 'sort', 'section']) { const el = form.elements[n]; if (el && q.get(n)) el.value = q.get(n); }
  let t;
  form.oninput = () => { clearTimeout(t); t = setTimeout(load, 250); };
  form.onsubmit = (e) => { e.preventDefault(); load(); };
  $$('[data-fview]', form).forEach((b) => b.onclick = () => { S.fview = b.dataset.fview; localStorage.setItem('sjl_fview', S.fview); $$('[data-fview]', form).forEach((x) => x.classList.toggle('on', x === b)); load(); });
  return () => { const p = new URLSearchParams(); for (const n of ['q', 'type', 'ev', 'from', 'to', 'sort', 'section']) { const el = form.elements[n]; if (el?.value) p.set(n, el.value.trim()); } return p; };
}

// ======================= صفحة القسم =======================
async function viewSection(v, key, q) {
  let sec; let folder = q.get('folder') || '';
  const load = async () => { sec = await api('GET', `/api/sections/${encodeURIComponent(key)}`); };
  try { await load(); } catch (e) { v.innerHTML = `<div class="alert bad" style="margin-top:20px">${icon('alert')}<div>${esc(e.message)}</div></div>`; return; }
  const idx = secIndex(key) >= 0 ? secIndex(key) : sec.order - 1;
  const own = isOwner();
  const draw = () => {
    v.innerHTML = `<div class="page-head" style="display:block">
      <div class="crumbs"><a href="#/">الرئيسية</a>${icon('chevron', 'sr')}<span>›</span><span>${esc(sec.title)}</span></div></div>
    <section class="card">
      <div class="sec-hero">${ico3d(sec.icon, idx, 'lg')}<div style="flex:1;min-width:0">
        <div class="row"><span class="badge">المعيار ${sec.order}</span>${sec.folderId ? `<span class="badge ok">مرتبط بـ: ${esc(sec.folderName)}</span>` : '<span class="badge warn">غير مرتبط بمجلد</span>'}<span class="badge v">${num(sec.count)} شاهد · الهدف ${sec.targetCount}</span><span class="muted small">${sec.lastSync ? 'آخر مزامنة ' + dateTime(sec.lastSync) : ''}</span></div>
        <h2 style="margin-top:8px">${esc(sec.title)}</h2><p>${esc(sec.desc)}</p>
        <div class="progress ${sec.completion >= 100 ? 'ok' : ''}" style="margin-top:12px;max-width:520px"><i style="width:${sec.completion}%"></i></div>
      </div></div>
      ${sec.folderId ? `<div class="actions">
        ${own ? `<button class="btn primary" data-a="evidence">${icon('plus')} إضافة شاهد</button><button class="btn soft" data-a="upload">${icon('upload')} رفع ملفات</button><button class="btn" data-a="mkdir">${icon('folderPlus')} إنشاء مجلد فرعي</button>` : ''}
        <button class="btn" data-a="sync">${icon('sync')} مزامنة</button>
        <a class="btn" href="${driveFolderUrl(folder || sec.folderId)}" target="_blank" rel="noopener">${icon('external')} فتح المجلد في Drive</a>
        ${own ? `<button class="btn violet" data-a="tips">${icon('sparkle')} الشواهد المقترحة</button>` : ''}
      </div>` : own ? `<div class="alert" style="margin-top:14px">${icon('folder')}<div style="flex:1">اربطي هذا القسم بمجلده في Google Drive من الإعدادات.</div><a class="btn primary" href="#/settings">ربط المجلدات</a></div>` : ''}
    </section>
    ${sec.folderId ? `<div class="folders" aria-label="المجلدات الفرعية">
      <button class="chip ${!folder ? 'on' : ''}" data-folder="">${icon('folder', 'sr')}كل الشواهد (${num(sec.count)})</button>
      ${sec.folders.map((f) => `<button class="chip ${folder === f.id ? 'on' : ''}" data-folder="${esc(f.id)}" title="${esc(f.path + ' / ' + f.name)}">📁 ${esc(f.path.split(' / ').slice(1).concat(f.name).join(' › '))} (${f.fileCount})</button>`).join('')}
    </div>
    <div class="card solid" style="margin-top:10px">${filterBar(q)}<div id="files"></div></div>` : ''}`;
    if (!sec.folderId) return;
    const filesEl = $('#files', v);
    const getParams = bindFilters(v, q, () => refreshFiles());
    async function refreshFiles() {
      const p = getParams(); if (folder) p.set('folder', folder);
      try {
        const files = await api('GET', `/api/sections/${key}/files?${p}`);
        renderFiles(filesEl, files, { emptyHint: own ? 'استخدمي «إضافة شاهد» أو «رفع ملفات» لإضافة شواهد هذا المعيار.' : '' });
      } catch (e) { filesEl.innerHTML = `<div class="alert bad">${icon('alert')}<div>${esc(e.message)}</div></div>`; }
    }
    bindFileActions(filesEl, async () => { await load(); draw(); });
    $$('[data-folder]', v).forEach((b) => b.onclick = () => { folder = b.dataset.folder; draw(); });
    const act = async (a, btn) => {
      if (a === 'evidence' || a === 'upload') openUploadModal({ section: sec, me: S.me, mode: a === 'evidence' ? 'evidence' : 'files', defaultFolder: folder, onDone: async () => { await load(); draw(); } });
      else if (a === 'mkdir') {
        const where = folder ? sec.folders.find((f) => f.id === folder) : null;
        const name = await promptDialog({ title: 'إنشاء مجلد فرعي', label: `اسم المجلد (سيُنشأ داخل: ${where ? where.name : sec.folderName}) — مثال: صور توثيقية، 1448، الفصل الأول`, ok: 'إنشاء' });
        if (!name) return;
        try { await api('POST', `/api/sections/${key}/folders`, { name, parentId: folder || undefined }); toast('تم إنشاء المجلد في Google Drive', 'ok'); await load(); draw(); } catch (e) { toastErr(e); }
      } else if (a === 'sync') {
        btn.disabled = true; btn.innerHTML = `${icon('sync')} جارٍ المزامنة…`;
        try { const r = await api('POST', `/api/sections/${key}/sync`); toast(`تمت المزامنة: ${r.files} ملف، ${r.folders} مجلد`, 'ok'); await load(); draw(); } catch (e) { toastErr(e); btn.disabled = false; }
      } else if (a === 'tips') {
        try {
          const r = await api('POST', '/api/assistant', { action: 'missing', sectionKey: key });
          const s = r.sections[0];
          modal({ title: `الشواهد المقترحة — ${sec.title}`, body: `<span class="badge">اقتراح بالقواعد وفق المعيار</span>
            <p style="margin:0">لديك <b>${s.count}</b> شاهد من أصل <b>${s.target}</b> مستهدف.</p>
            <div><b>شواهد مقترحة لم يُعثر على ما يطابقها في أسماء ملفاتك:</b><ul>${s.missing.map((x) => `<li>${esc(x)}</li>`).join('') || '<li>تبدو جميع الشواهد المقترحة موثقة 👏</li>'}</ul></div>
            <div><b>كل الشواهد المناسبة لهذا المعيار:</b><div class="row" style="margin-top:6px">${sec.suggestions.map((x) => `<span class="chip">${esc(x)}</span>`).join('')}</div></div>`, foot: '<button class="btn" data-close>إغلاق</button>' });
        } catch (e) { toastErr(e); }
      }
    };
    $$('[data-a]', v).forEach((b) => b.onclick = () => act(b.dataset.a, b));
    refreshFiles();
  };
  draw();
  if (S.me.drive.connected && sec.folderId && (!sec.lastSync || Date.now() - sec.lastSync > 2 * 60 * 1000)) {
    api('POST', `/api/sections/${key}/sync`).then(async () => { if (parseHash().arg === key) { await load(); draw(); } }).catch(() => {});
  }
}

// ======================= البحث الشامل =======================
async function viewSearch(v, q) {
  if (!S.sections.length) await loadSections();
  v.innerHTML = `<div class="page-head"><div><h2>البحث الشامل</h2><p>ابحثي في جميع الأقسام الإحدى عشرة — تظهر لكل نتيجة القسم ومسار المجلد</p></div></div>
    <div class="card solid">${filterBar(q, `<select class="input" name="section" aria-label="القسم"><option value="">كل الأقسام</option>${S.sections.map((s) => `<option value="${s.key}">${esc(s.title)}</option>`).join('')}</select>`)}
    <div class="muted small" id="count" style="margin-top:10px"></div><div id="files"></div></div>`;
  $('[data-filters]', v).classList.add('with-sec');
  const filesEl = $('#files', v);
  const getParams = bindFilters(v, q, () => run());
  async function run() {
    const p = getParams();
    history.replaceState(null, '', `#/search?${p}`);
    const sec = p.get('section'); p.delete('section');
    try {
      const files = sec ? await api('GET', `/api/sections/${sec}/files?${p}`) : await api('GET', `/api/search?${p}`);
      const list = files.map((f) => ({ ...f, sectionTitle: f.sectionTitle || S.sections.find((s) => s.key === f.section)?.title }));
      $('#count', v).textContent = `${list.length} نتيجة`;
      renderFiles(filesEl, list, { showSection: true });
    } catch (e) { filesEl.innerHTML = `<div class="alert bad">${icon('alert')}<div>${esc(e.message)}</div></div>`; }
  }
  bindFileActions(filesEl, run);
  run();
  $('[name=q]', v).focus();
}

// ======================= لوحة التحكم =======================
async function viewDashboard(v) {
  v.innerHTML = `${officialHeader()}<div class="page-head"><div><h2>لوحة التحكم</h2><p>توزيع الشواهد على المعايير الإحدى عشرة ونسب الاكتمال</p></div><a class="btn" href="#/reports">${icon('print')} التقارير</a></div><div class="boot" style="min-height:200px"><div class="spinner"></div></div>`;
  let d;
  try { d = await api('GET', '/api/dashboard'); } catch (e) { v.innerHTML += `<div class="alert bad">${esc(e.message)}</div>`; return; }
  S.sections = d.sections;
  const q = d.quota;
  const maxBar = Math.max(...d.sections.map((s) => Math.max(s.count, s.targetCount)), 1);
  const typeColors = ['#2A55E8', '#7A62E8', '#2BB5F0', '#12A36B', '#E37400', '#D93B4E', '#475569'];
  $('.boot', v).outerHTML = `
    <div class="stats">
      <div class="card stat">${ico3d('report', 0, 'sm')}<div><div class="num">${num(d.total)}</div><div class="lbl">إجمالي الشواهد</div></div></div>
      <div class="card stat">${ico3d('upload', 1, 'sm')}<div><div class="num">${num(d.uploaded)}</div><div class="lbl">ملفات رُفعت عبر المنصة</div></div></div>
      <div class="card stat">${ico3d('alert', 4, 'sm')}<div><div class="num">${d.incomplete.length}</div><div class="lbl">معايير لم تكتمل</div></div></div>
      <div class="card stat">${ico3d('cloud', 2, 'sm')}<div><div class="num">${bytes(d.bytes)}</div><div class="lbl">حجم الشواهد في Drive</div></div></div>
    </div>
    <div class="dash">
      <section class="card"><h3>${icon('chart')} توزيع الشواهد على المعايير</h3>
        <div class="bars" role="list">${d.sections.map((s) => `<div class="bar-row" role="listitem" data-go="${s.key}" title="${esc(s.title)}: ${s.count} من ${s.targetCount}">
          <span class="bar-label">${s.order}. ${esc(s.title)}</span>
          <span class="bar-track"><span class="bar-fill" style="display:block;width:${(s.count / maxBar) * 100}%;${s.completion >= 100 ? 'background:linear-gradient(90deg,#3DD598,#12A36B)' : ''}"></span><span class="bar-target" style="right:${(s.targetCount / maxBar) * 100}%"></span></span>
          <span class="bar-val">${s.count}</span></div>`).join('')}</div>
        <div class="legend"><span><i></i>عدد الشواهد</span><span><i class="t"></i>العدد المستهدف</span></div>
      </section>
      <div class="grid">
        <section class="card"><h3>${icon('growth')} نسبة الاكتمال العامة</h3><div class="row" style="gap:20px"><div class="ring" style="--p:${d.overallCompletion}"><div>${d.overallCompletion}%</div></div>
          <div class="small" style="flex:1">${d.top.length ? `<b>الأكثر توثيقًا:</b>${d.top.map((s) => `<div>• ${esc(s.title)} (${s.count})</div>`).join('')}` : 'لا توجد شواهد بعد'}</div></div></section>
        <section class="card"><h3>${icon('cloud')} المساحة التخزينية في Google Drive</h3>${q ? `
          <div class="progress" style="height:12px"><i style="width:${q.limit ? Math.min(100, (q.usage / q.limit) * 100) : 4}%"></i></div>
          <div class="row small" style="margin-top:8px;justify-content:space-between"><span>المستخدم: <b>${bytes(q.usage)}</b></span><span>${q.limit ? `المتبقي: <b>${bytes(q.limit - q.usage)}</b> من ${bytes(q.limit)}` : 'الحساب بلا حد محدد من Google'}</span></div>
          <p class="muted small" style="margin:8px 0 0">المساحة مشتركة بين Drive وGmail وصور Google. لا تضع المنصة حدًا مصطنعًا لحجم الملفات.</p>` : '<p class="muted small">تظهر بعد ربط Google Drive.</p>'}</section>
      </div>
    </div>
    <div class="dash">
      <section class="card"><h3>${icon('clock')} آخر الملفات المضافة</h3><div class="mini-list">${d.latest.length ? d.latest.map((f) => { S.files.set(f.id, f); const k = fileKind(f.mimeType, f.name); return `<div class="mini-item" data-preview="${esc(f.id)}"><span class="ft" style="color:${k.color}">${icon('file')}</span><div><b>${esc(f.name)}</b><small>${esc(f.sectionTitle)} · ${hijri(f.createdTime)}</small></div></div>`; }).join('') : '<p class="muted">لا توجد ملفات بعد</p>'}</div></section>
      <div class="grid">
        <section class="card"><h3>${icon('alert')} معايير لم تكتمل شواهدها</h3><div class="mini-list">${d.incomplete.length ? d.incomplete.map((s) => `<div class="mini-item" data-go="${s.key}"><span class="ft">${s.completion}%</span><div><b>${esc(s.title)}</b><small>${s.count} من ${s.targetCount} — ينقص ${Math.max(0, s.targetCount - s.count)}</small></div></div>`).join('') : '<p class="muted">جميع المعايير مكتملة 🎉</p>'}</div></section>
        <section class="card"><h3>${icon('sparkle')} أنواع الشواهد</h3><div class="row">${d.byType.map((t, i) => `<span class="chip"><span style="width:9px;height:9px;border-radius:3px;background:${typeColors[i % typeColors.length]}"></span>${esc(t.t)} <b>${t.n}</b></span>`).join('') || '<span class="muted">—</span>'}</div></section>
      </div>
    </div>`;
  v.onclick = (e) => {
    const g = e.target.closest('[data-go]'); if (g) go(`#/section/${g.dataset.go}`);
    const p = e.target.closest('[data-preview]'); if (p) previewFile(S.files.get(p.dataset.preview));
  };
}

// ======================= التقارير =======================
async function viewReports(v, q) {
  if (!S.sections.length) await loadSections();
  v.innerHTML = `<div class="page-head no-print"><div><h2>التقارير</h2><p>تقارير رسمية بالترويسة جاهزة للطباعة والتصدير PDF</p></div></div>
    <div class="card solid no-print"><div class="row">
      <label class="f" style="min-width:220px">نوع التقرير<select class="input" name="type">
        <option value="full">تقرير شامل لجميع المعايير</option><option value="section">تقرير مستقل لمعيار</option><option value="counts">تقرير بعدد الشواهد</option>
        <option value="incomplete">تقرير بالأقسام غير المكتملة</option><option value="latest">تقرير بأحدث الإضافات</option></select></label>
      <label class="f" style="min-width:220px" data-secwrap>المعيار<select class="input" name="section">${S.sections.map((s) => `<option value="${s.key}">${s.order}. ${esc(s.title)}</option>`).join('')}</select></label>
      <span class="spacer"></span>
      <button class="btn primary" data-print>${icon('print')} طباعة</button>
      <button class="btn" data-pdf>${icon('download')} تصدير PDF</button>
    </div><p class="muted small" style="margin:8px 0 0">«تصدير PDF» يفتح نافذة الطباعة؛ اختاري الطابعة «حفظ بتنسيق PDF / Save as PDF».</p></div>
    <div id="report" style="margin-top:16px"><div class="boot" style="min-height:200px"><div class="spinner"></div></div></div>`;
  const typeEl = $('[name=type]', v); const secEl = $('[name=section]', v);
  if (q.get('type')) typeEl.value = q.get('type'); if (q.get('section')) secEl.value = q.get('section');
  let all = null;
  const draw = async () => {
    $('[data-secwrap]', v).style.display = typeEl.value === 'section' ? '' : 'none';
    const out = $('#report', v);
    try {
      const [secs, files] = await Promise.all([api('GET', '/api/sections'), all || api('GET', '/api/search?limit=5000&sort=oldest')]);
      all = files; S.sections = secs;
      out.innerHTML = buildReport(typeEl.value, secEl.value, secs, files);
    } catch (e) { out.innerHTML = `<div class="alert bad">${esc(e.message)}</div>`; }
  };
  typeEl.onchange = draw; secEl.onchange = draw;
  $('[data-print]', v).onclick = () => window.print();
  $('[data-pdf]', v).onclick = () => { const t = document.title; document.title = `تقرير شواهد الأداء - ${S.me.profile.teacher}`; window.print(); setTimeout(() => { document.title = t; }, 1000); };
  draw();
}

function buildReport(type, secKey, secs, files) {
  const p = S.me.profile;
  const today = new Date();
  const titles = { full: 'تقرير شامل لشواهد الأداء الوظيفي', section: 'تقرير شواهد معيار', counts: 'تقرير بعدد الشواهد لكل معيار', incomplete: 'تقرير بالمعايير غير المكتملة', latest: 'تقرير بأحدث الشواهد المضافة' };
  const head = `<div class="rep-head">
    <div class="r">المملكة العربية السعودية<br>وزارة التعليم<br>${esc(p.authority)}<br>${esc(p.school)}</div>
    <div class="c"><img src="/assets/logo.svg" alt=""><h2>${esc(titles[type])}</h2><div class="small">${esc(p.platformName)}</div></div>
    <div class="l">المعلمة: ${esc(p.teacher)}<br>التخصص: ${esc(p.specialty)}<br>العام الدراسي: ${esc(p.year)}<br>تاريخ التقرير: ${hijri(today)}</div></div>`;
  const total = secs.reduce((a, s) => a + s.count, 0);
  const summary = (list) => `<table><thead><tr><th>م</th><th>المعيار</th><th>عدد الشواهد</th><th>المستهدف</th><th>نسبة الاكتمال</th><th>الحالة</th></tr></thead><tbody>
    ${list.map((s) => `<tr><td>${s.order}</td><td>${esc(s.title)}</td><td>${s.count}</td><td>${s.targetCount}</td><td>${s.completion}%</td><td>${s.completion >= 100 ? 'مكتمل' : s.count ? 'قيد التوثيق' : 'لا توجد شواهد'}</td></tr>`).join('')}
    ${list.length > 1 ? `<tr style="font-weight:700"><td></td><td>الإجمالي</td><td>${list.reduce((a, s) => a + s.count, 0)}</td><td>${list.reduce((a, s) => a + s.targetCount, 0)}</td><td>${Math.round(list.reduce((a, s) => a + s.completion, 0) / list.length)}%</td><td></td></tr>` : ''}</tbody></table>`;
  const fileTable = (list, withSec = false) => list.length ? `<table><thead><tr><th>م</th><th>اسم الشاهد</th>${withSec ? '<th>المعيار</th>' : ''}<th>النوع</th><th>التاريخ</th><th>المسار</th></tr></thead><tbody>
    ${list.map((f, i) => `<tr><td>${i + 1}</td><td>${esc(f.name)}${f.description ? `<div class="muted" style="font-size:11px">${esc(f.description)}</div>` : ''}</td>${withSec ? `<td>${esc(f.sectionTitle)}</td>` : ''}<td>${esc(f.evidenceType || '—')}</td><td>${hijri(f.evidenceDate || f.createdTime)}</td><td style="font-size:11px">${esc(f.path)}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">لا توجد شواهد.</p>';
  let body = '';
  if (type === 'full') {
    body = `<h3>ملخص المعايير (${total} شاهدًا)</h3>${summary(secs)}` + secs.map((s) => `<h3>${s.order}. ${esc(s.title)} — ${s.count} شاهد</h3><p class="small" style="margin:0 0 6px">${esc(s.desc)}</p>${fileTable(files.filter((f) => f.section === s.key))}`).join('');
  } else if (type === 'section') {
    const s = secs.find((x) => x.key === secKey);
    body = `<h3>${s.order}. ${esc(s.title)}</h3><p>${esc(s.desc)}</p>${summary([s])}<h3>قائمة الشواهد</h3>${fileTable(files.filter((f) => f.section === s.key))}`;
  } else if (type === 'counts') {
    body = `<h3>عدد الشواهد لكل معيار</h3>${summary(secs)}`;
  } else if (type === 'incomplete') {
    const inc = secs.filter((s) => s.completion < 100);
    body = `<h3>المعايير غير المكتملة (${inc.length})</h3>${inc.length ? summary(inc) + inc.map((s) => `<h3>${esc(s.title)}</h3><p class="small">ينقص ${Math.max(0, s.targetCount - s.count)} شاهد. شواهد مقترحة: ${s.suggestions.map(esc).join('، ')}.</p>`).join('') : '<p>جميع المعايير مكتملة.</p>'}`;
  } else if (type === 'latest') {
    const latest = [...files].sort((a, b) => String(b.createdTime).localeCompare(String(a.createdTime))).slice(0, 30);
    body = `<h3>أحدث ${latest.length} شاهدًا</h3>${fileTable(latest, true)}`;
  }
  return `<article class="report">${head}${body}
    <div class="rep-sign"><div>المعلمة<br><b>${esc(p.teacher)}</b><br><br>التوقيع: ....................</div><div>مديرة المدرسة<br><b>${esc(p.principal)}</b><br><br>التوقيع: ....................</div></div>
    <div class="rep-foot">صدر من ${esc(p.platformName)} بتاريخ ${hijri(today)} الموافق ${greg(today)} — البيانات مأخوذة من Google Drive وقت آخر مزامنة.</div></article>`;
}

// ======================= صفحة المساعد =======================
async function viewAssistant(v) {
  v.innerHTML = `<div class="page-head"><div><h2>مساعد شواهد الأداء</h2><p>اقتراح الشواهد المناسبة لكل معيار، وكشف الشواهد الناقصة، وتصنيف وتسمية ووصف الشواهد</p></div></div>
    <div class="alert ${S.me.aiEnabled ? 'info' : ''}">${icon(S.me.aiEnabled ? 'robot' : 'info')}<div>${S.me.aiEnabled ? 'تم ربط نموذج ذكاء اصطناعي حقيقي بالخادم: تلخيص المحتوى واقتراح الوصف والتصنيف من داخل الملف متاحة من زر ✨ على كل شاهد.' : '<b>وضع القواعد الآلية:</b> الاقتراحات هنا مبنية على معايير الأداء وأسماء ملفاتك داخل المنصة، وليست نموذج ذكاء اصطناعي. لتفعيل تلخيص محتوى الملفات بذكاء اصطناعي حقيقي أضيفي ANTHROPIC_API_KEY في إعدادات الخادم.'}</div></div>
    <div id="as" class="grid" style="margin-top:16px"><div class="boot" style="min-height:160px"><div class="spinner"></div></div></div>`;
  try {
    const r = await api('POST', '/api/assistant', { action: 'missing' });
    if (!S.sections.length) await loadSections();
    $('#as', v).className = 'sections';
    $('#as', v).innerHTML = r.sections.map((s, i) => `<section class="card" style="display:grid;gap:10px;align-content:start">
      <div class="row">${ico3d(S.sections[i]?.icon || 'file', i, 'sm')}<h3 style="margin:0;flex:1;font-size:15px">${esc(s.title)}</h3></div>
      <div class="row small"><span class="badge ${s.count >= s.target ? 'ok' : s.count ? '' : 'bad'}">${s.count} / ${s.target}</span>${s.mapped ? '' : '<span class="badge warn">غير مرتبط</span>'}</div>
      <div class="small"><b>شواهد مقترحة ناقصة:</b>${s.missing.length ? `<ul style="margin:4px 0;padding-inline-start:18px">${s.missing.map((m) => `<li>${esc(m)}</li>`).join('')}</ul>` : '<div class="muted">لا توجد — أحسنتِ 👏</div>'}</div>
      <a class="btn sm soft" href="#/section/${s.key}">فتح المعيار</a></section>`).join('');
  } catch (e) { $('#as', v).innerHTML = `<div class="alert bad">${esc(e.message)}</div>`; }
}

// ======================= الإعدادات =======================
function folderBrowser({ title = 'اختيار مجلد من Google Drive' } = {}) {
  return new Promise((resolve) => {
    let done = false; const trail = [{ id: 'root', name: 'My Drive (ملفاتي)' }];
    const m = modal({ title, body: `<div class="crumbs" data-trail></div><div class="fbrowser" data-list></div>`, foot: `<button class="btn primary" data-pick>${icon('check')} اختيار هذا المجلد</button><button class="btn" data-close>إلغاء</button>`, onClose: () => { if (!done) resolve(null); } });
    const list = $('[data-list]', m.el);
    const load = async () => {
      const cur = trail[trail.length - 1];
      $('[data-trail]', m.el).innerHTML = trail.map((t, i) => `<a href="javascript:void 0" data-t="${i}">${esc(t.name)}</a>`).join('<span>›</span>');
      $('[data-pick]', m.el).disabled = cur.id === 'root';
      list.innerHTML = '<div style="padding:20px"><div class="spinner"></div></div>';
      try {
        const fs = await api('GET', `/api/drive/folders?parent=${encodeURIComponent(cur.id)}`);
        list.innerHTML = fs.length ? fs.map((f) => `<button data-id="${esc(f.id)}" data-name="${esc(f.name)}">${icon('folder')}<span>${esc(f.name)}</span></button>`).join('') : '<p class="muted" style="padding:14px;margin:0">لا توجد مجلدات فرعية هنا</p>';
      } catch (e) { list.innerHTML = `<div class="alert bad">${esc(e.message)}</div>`; }
    };
    list.onclick = (e) => { const b = e.target.closest('[data-id]'); if (b) { trail.push({ id: b.dataset.id, name: b.dataset.name }); load(); } };
    $('[data-trail]', m.el).onclick = (e) => { const a = e.target.closest('[data-t]'); if (a) { trail.length = Number(a.dataset.t) + 1; load(); } };
    $('[data-pick]', m.el).onclick = () => { done = true; m.close(); resolve(trail[trail.length - 1]); };
    load();
  });
}

async function viewSettings(v, q) {
  if (q.get('connected')) { toast('تم ربط حساب Google Drive بنجاح', 'ok'); history.replaceState(null, '', '#/settings'); }
  if (!isOwner()) {
    v.innerHTML = `<div class="page-head"><div><h2>الإعدادات</h2></div></div><div class="card"><p>أنتِ مسجّلة بحساب <b>${esc(S.me.user.email)}</b> بصلاحية <b>اطلاع فقط</b>. تستطيعين تصفح الشواهد والبحث فيها ومعاينتها وتنزيلها وطباعة التقارير.</p><p class="muted small">إدارة الملفات والربط متاحة لصاحبة المنصة فقط.</p></div>`;
    return;
  }
  const tab = q.get('tab') || 'drive';
  const tabs = [['drive', 'الربط مع Google Drive'], ['profile', 'بيانات الترويسة'], ['targets', 'أهداف المعايير'], ['viewers', 'المطّلعون'], ['backup', 'النسخ الاحتياطي'], ['log', 'سجل العمليات'], ['limits', 'التخزين والحدود']];
  v.innerHTML = `<div class="page-head"><div><h2>الإعدادات</h2><p>إدارة الربط مع Google Drive وبيانات المنصة</p></div></div>
    <div class="tabs" role="tablist">${tabs.map(([k, t]) => `<button role="tab" class="${k === tab ? 'on' : ''}" data-tab="${k}">${t}</button>`).join('')}</div><div id="tab"></div>`;
  $$('[data-tab]', v).forEach((b) => b.onclick = () => go(`#/settings?tab=${b.dataset.tab}`));
  const t = $('#tab', v);
  const handlers = { drive: tabDrive, profile: tabProfile, targets: tabTargets, viewers: tabViewers, backup: tabBackup, log: tabLog, limits: tabLimits };
  await handlers[tab](t);
}

async function refreshMe() { S.me = await api('GET', '/api/me', undefined, { allow401: true }); }

async function tabDrive(t) {
  const me = S.me; const d = me.drive;
  const step = !d.connected ? 1 : !me.root ? 2 : 3;
  t.innerHTML = `<div class="steps">
      <div class="step ${d.connected ? 'done' : 'cur'}"><span class="n">${d.connected ? '✓' : 1}</span><div><b>ربط حساب Google Drive</b><div class="small muted">${d.connected ? esc(d.email) : 'تسجيل دخول آمن OAuth 2.0'}</div></div></div>
      <div class="step ${me.root ? 'done' : step === 2 ? 'cur' : ''}"><span class="n">${me.root ? '✓' : 2}</span><div><b>اختيار المجلد الرئيسي</b><div class="small muted">${me.root ? esc(me.root.name) : 'مجلد سجل الشواهد في حسابك'}</div></div></div>
      <div class="step ${me.mappedCount === 11 ? 'done' : step === 3 ? 'cur' : ''}"><span class="n">${me.mappedCount === 11 ? '✓' : 3}</span><div><b>ربط الأقسام بالمجلدات</b><div class="small muted">${me.mappedCount} من 11 قسمًا</div></div></div>
    </div>
    <section class="card" style="margin-top:14px"><h3>${icon('cloud')} حالة الاتصال</h3>
      ${d.connected ? `<p style="margin:0">مرتبط بحساب <b>${esc(d.email)}</b> منذ ${dateTime(d.connectedAt)}.</p>` : d.needsReauth ? '<div class="alert bad">' + icon('alert') + '<div>انتهت صلاحية الربط أو أُلغيت من حساب Google. أعيدي الربط — ستبقى إعدادات المجلدات كما هي.</div></div>' : '<p style="margin:0">لم يتم الربط بعد.</p>'}
      ${me.serverProblems.length ? `<div class="alert bad" style="margin-top:10px">${icon('alert')}<div><b>إعداد الخادم غير مكتمل:</b> ${me.serverProblems.map(esc).join('، ')}<div class="small">راجعي docs/GOOGLE_SETUP.md</div></div></div>` : ''}
      <div class="actions"><a class="btn primary" href="/auth/connect-drive">${icon('cloud')} ${d.connected ? 'إعادة ربط حساب Google Drive' : 'ربط حساب Google Drive'}</a>
      ${d.connected ? `<button class="btn" data-root>${icon('folder')} ${me.root ? 'تغيير المجلد الرئيسي' : 'اختيار المجلد الرئيسي'}</button><button class="btn danger" data-disc>${icon('logout')} إلغاء الربط</button>` : ''}</div>
      <p class="muted small" style="margin:10px 0 0">الصلاحية المطلوبة: الوصول إلى Google Drive لقراءة ورفع وتعديل الشواهد في المجلدات التي تربطينها فقط. الرموز تُحفظ مشفّرة في الخادم ولا تصل إلى المتصفح.</p>
    </section>
    <section class="card" style="margin-top:14px" id="mapping">${me.root ? '<div class="spinner"></div>' : '<p class="muted" style="margin:0">اختاري المجلد الرئيسي أولًا لعرض شاشة ربط الأقسام.</p>'}</section>`;
  const rootBtn = $('[data-root]', t);
  if (rootBtn) rootBtn.onclick = async () => {
    const f = await folderBrowser({ title: 'اختيار مجلد سجل شواهد الأداء الرئيسي' });
    if (!f) return;
    try { await api('POST', '/api/settings/root', { folderId: f.id }); await refreshMe(); toast(`تم اختيار المجلد «${f.name}» — راجعي الربط المقترح ثم احفظيه`, 'ok'); tabDrive(t); } catch (e) { toastErr(e); }
  };
  const disc = $('[data-disc]', t);
  if (disc) disc.onclick = async () => {
    if (!await confirmDialog({ title: 'إلغاء الربط مع Google Drive', message: 'سيُلغى إذن المنصة على حسابك وتُحذف الرموز من الخادم. ملفاتك في Drive لن تتأثر إطلاقًا. يمكنك إعادة الربط لاحقًا.', ok: 'إلغاء الربط', danger: true })) return;
    try { await api('POST', '/api/drive/disconnect'); await refreshMe(); toast('تم إلغاء الربط', 'ok'); tabDrive(t); } catch (e) { toastErr(e); }
  };
  if (me.root && d.connected) renderMapping($('#mapping', t));
}

async function renderMapping(box) {
  let info;
  try { info = await api('GET', '/api/mapping'); } catch (e) { box.innerHTML = `<div class="alert bad">${esc(e.message)}</div>`; return; }
  const extra = {}; // مجلدات مختارة من خارج المجلد الرئيسي
  info.sections.forEach((s) => { if (s.folder_id && !info.folders.some((f) => f.id === s.folder_id)) extra[s.folder_id] = s.folder_name; });
  const draw = () => {
    const allFolders = info.folders.concat(Object.entries(extra).map(([id, name]) => ({ id, name: `${name} (خارج المجلد الرئيسي)` })));
    box.innerHTML = `<h3>${icon('folder')} ربط الأقسام بمجلدات Drive</h3>
      <p class="small muted" style="margin:-4px 0 12px">المجلد الرئيسي: <b>${esc(info.root.name)}</b> — ${info.folders.length} مجلد فرعي. المقترح التلقائي يعتمد على تشابه الأسماء؛ راجعيه وعدّليه يدويًا عند الحاجة.</p>
      <div style="overflow:auto"><table class="table"><thead><tr><th>المعيار</th><th>المجلد المرتبط</th><th>المقترح التلقائي</th><th></th></tr></thead><tbody>
      ${info.sections.map((s) => { const sug = info.suggestions[s.key]; return `<tr><td><b>${s.sort_order}.</b> ${esc(s.title)}</td>
        <td><select class="input" data-map="${s.key}" style="min-width:200px"><option value="">— غير مرتبط —</option>${allFolders.map((f) => `<option value="${esc(f.id)}" ${s.folder_id === f.id ? 'selected' : ''}>${esc(f.name)}</option>`).join('')}</select></td>
        <td>${sug ? `<span class="badge ${sug.score >= 0.75 ? 'ok' : 'warn'}">${esc(sug.folderName)} · ${Math.round(sug.score * 100)}%</span>` : '<span class="muted small">لا يوجد</span>'}</td>
        <td><button class="btn sm ghost" data-browse="${s.key}" title="اختيار مجلد من مكان آخر">${icon('search')}</button></td></tr>`; }).join('')}
      </tbody></table></div>
      <div class="actions"><button class="btn soft" data-apply>${icon('sparkle')} تطبيق المقترحات</button><button class="btn primary" data-save>${icon('check')} حفظ الربط ومزامنة الملفات</button><button class="btn" data-create>${icon('folderPlus')} إنشاء مجلدات للأقسام غير المرتبطة</button></div>`;
    $('[data-apply]', box).onclick = () => { for (const [k, sg] of Object.entries(info.suggestions)) { const sel = $(`[data-map="${k}"]`, box); if (sel && !sel.value) sel.value = sg.folderId; } toast('طُبّقت المقترحات على الأقسام غير المرتبطة — اضغطي حفظ'); };
    $$('[data-browse]', box).forEach((b) => b.onclick = async () => { const f = await folderBrowser(); if (!f) return; extra[f.id] = f.name; const k = b.dataset.browse; const cur = Object.fromEntries($$('[data-map]', box).map((s) => [s.dataset.map, s.value])); draw(); for (const [kk, vv] of Object.entries(cur)) $(`[data-map="${kk}"]`, box).value = vv; $(`[data-map="${k}"]`, box).value = f.id; });
    $('[data-save]', box).onclick = async (e) => {
      const map = Object.fromEntries($$('[data-map]', box).map((s) => [s.dataset.map, s.value || null]));
      const ids = Object.values(map).filter(Boolean);
      if (new Set(ids).size !== ids.length) { toast('لا يمكن ربط المجلد نفسه بأكثر من قسم', 'bad'); return; }
      e.target.disabled = true; e.target.textContent = 'جارٍ الحفظ والمزامنة…';
      try { info = { ...info, ...(await api('POST', '/api/mapping', { map })) }; await refreshMe(); toast('تم حفظ الربط ومزامنة الأقسام المتغيرة', 'ok'); draw(); } catch (err) { toastErr(err); e.target.disabled = false; }
    };
    $('[data-create]', box).onclick = async (e) => {
      const n = info.sections.filter((s) => !s.folder_id).length;
      if (!n) { toast('جميع الأقسام مرتبطة'); return; }
      if (!await confirmDialog({ title: 'إنشاء المجلدات الناقصة', message: `سيتم إنشاء ${n} مجلد داخل «${esc(info.root.name)}» في Google Drive بأسماء المعايير، وربطها تلقائيًا. احفظي أي تغييرات يدوية قبل ذلك.`, ok: 'إنشاء وربط' })) return;
      e.target.disabled = true;
      try { info = { ...info, ...(await api('POST', '/api/mapping/create-missing')) }; await refreshMe(); toast('تم إنشاء المجلدات وربطها', 'ok'); draw(); } catch (err) { toastErr(err); e.target.disabled = false; }
    };
  };
  draw();
}

function tabProfile(t) {
  const p = S.me.profile;
  const fields = [['platformName', 'اسم المنصة'], ['teacher', 'اسم المعلمة'], ['specialty', 'التخصص'], ['school', 'المدرسة'], ['principal', 'مديرة المدرسة'], ['authority', 'الجهة التعليمية'], ['year', 'العام الدراسي']];
  t.innerHTML = `<section class="card"><h3>${icon('user')} بيانات الترويسة الرسمية</h3><p class="small muted" style="margin-top:-6px">تظهر أعلى المنصة وفي جميع التقارير المطبوعة.</p>
    <form class="form-grid" data-f>${fields.map(([k, l]) => `<label class="f">${l}<input class="input" name="${k}" value="${esc(p[k])}" maxlength="150"></label>`).join('')}
    <div class="full"><button class="btn primary">${icon('check')} حفظ البيانات</button></div></form></section>`;
  $('[data-f]', t).onsubmit = async (e) => {
    e.preventDefault();
    try { S.me.profile = await api('PUT', '/api/settings/profile', Object.fromEntries(new FormData(e.target))); toast('تم حفظ بيانات الترويسة', 'ok'); route(); } catch (err) { toastErr(err); }
  };
}

async function tabTargets(t) {
  const secs = await loadSections();
  t.innerHTML = `<section class="card"><h3>${icon('growth')} العدد المستهدف من الشواهد لكل معيار</h3><p class="small muted" style="margin-top:-6px">تُحسب نسبة الاكتمال في لوحة التحكم والتقارير على أساس هذا العدد.</p>
    <table class="table"><tbody>${secs.map((s) => `<tr><td>${s.order}. ${esc(s.title)}</td><td class="muted small">${s.count} حاليًا</td><td style="width:140px"><input class="input" type="number" min="1" max="500" value="${s.targetCount}" data-t="${s.key}"></td></tr>`).join('')}</tbody></table>
    <div class="actions"><button class="btn primary" data-save>${icon('check')} حفظ الأهداف</button></div></section>`;
  $('[data-save]', t).onclick = async () => {
    try {
      for (const inp of $$('[data-t]', t)) { const s = secs.find((x) => x.key === inp.dataset.t); if (Number(inp.value) !== s.targetCount) await api('PATCH', `/api/sections/${s.key}`, { targetCount: Number(inp.value) }); }
      toast('تم حفظ الأهداف', 'ok'); await loadSections();
    } catch (e) { toastErr(e); }
  };
}

async function tabViewers(t) {
  const r = await api('GET', '/api/viewers');
  t.innerHTML = `<section class="card"><h3>${icon('user')} المطّلعون (اطلاع فقط)</h3>
    <p class="small muted" style="margin-top:-6px">أضيفي بريد Google لمديرة المدرسة أو المشرفة. تستطيع الدخول من أي جهاز ومشاهدة الشواهد والتقارير دون تعديل أو حذف.</p>
    <form class="row" data-add><input class="input" type="email" name="email" placeholder="example@gmail.com" required style="flex:1;min-width:220px"><button class="btn primary">${icon('plus')} إضافة</button></form>
    <table class="table" style="margin-top:12px"><thead><tr><th>البريد</th><th>آخر دخول</th><th></th></tr></thead><tbody>
    ${r.fromEnv.map((e) => `<tr><td>${esc(e)}</td><td class="muted small">من إعدادات الخادم (VIEWER_EMAILS)</td><td></td></tr>`).join('')}
    ${r.list.map((u) => `<tr><td>${esc(u.email)}</td><td class="small">${u.last_login ? dateTime(u.last_login) : 'لم يدخل بعد'}</td><td><button class="btn sm danger" data-rm="${esc(u.email)}">${icon('trash')} إزالة</button></td></tr>`).join('')}
    ${!r.fromEnv.length && !r.list.length ? '<tr><td colspan="3" class="muted">لا يوجد مطّلعون</td></tr>' : ''}</tbody></table></section>`;
  $('[data-add]', t).onsubmit = async (e) => { e.preventDefault(); try { await api('POST', '/api/viewers', { email: e.target.email.value }); toast('تمت الإضافة', 'ok'); tabViewers(t); } catch (err) { toastErr(err); } };
  $$('[data-rm]', t).forEach((b) => b.onclick = async () => { if (!await confirmDialog({ title: 'إزالة مطّلع', message: `إزالة صلاحية ${esc(b.dataset.rm)} وإنهاء جلساتها؟`, ok: 'إزالة', danger: true })) return; try { await api('DELETE', `/api/viewers/${encodeURIComponent(b.dataset.rm)}`); tabViewers(t); } catch (err) { toastErr(err); } });
}

function tabBackup(t) {
  t.innerHTML = `<section class="card"><h3>${icon('db')} النسخ الاحتياطي لإعدادات المنصة</h3>
    <p class="small muted" style="margin-top:-6px">تشمل النسخة: بيانات الترويسة، المجلد الرئيسي، ربط الأقسام بمعرّفات المجلدات (Folder IDs)، الأهداف، والمطّلعين. الملفات نفسها محفوظة أصلًا في Google Drive.</p>
    <div class="actions"><a class="btn primary" href="/api/backup">${icon('download')} تنزيل نسخة احتياطية (JSON)</a>
    <button class="btn soft" data-drive>${icon('cloud')} حفظ نسخة في Google Drive</button>
    <label class="btn">${icon('upload')} استعادة من ملف<input type="file" accept="application/json,.json" hidden data-restore></label></div></section>`;
  $('[data-drive]', t).onclick = async (e) => { e.target.disabled = true; try { await api('POST', '/api/backup/drive'); toast('تم حفظ النسخة داخل المجلد الرئيسي في Drive', 'ok'); } catch (err) { toastErr(err); } e.target.disabled = false; };
  $('[data-restore]', t).onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (!await confirmDialog({ title: 'استعادة الإعدادات', message: `سيتم استبدال الإعدادات الحالية بنسخة ${esc(data.exportedAt || '')}. هل تريدين المتابعة؟`, ok: 'استعادة' })) return;
      const r = await api('POST', '/api/backup/restore', data); await refreshMe();
      toast(`تمت الاستعادة${r.driveConnected ? ` وإعادة ربط ${r.remapped} قسم` : ' — اربطي Drive لتطبيق ربط المجلدات'}`, 'ok');
    } catch (err) { toastErr(err instanceof SyntaxError ? new Error('ملف غير صالح') : err); }
    e.target.value = '';
  };
}

const ACTIONS = { 'auth.login': 'تسجيل دخول', 'auth.denied': 'محاولة دخول مرفوضة', 'drive.connected': 'ربط Google Drive', 'drive.disconnected': 'إلغاء ربط Drive', 'drive.token_revoked': 'انتهاء صلاحية الربط', 'root.set': 'اختيار المجلد الرئيسي', 'mapping.update': 'تحديث ربط الأقسام', 'mapping.create_missing': 'إنشاء مجلدات الأقسام', 'section.sync': 'مزامنة قسم', 'sync.all': 'مزامنة الكل', 'section.target': 'تعديل هدف معيار', 'folder.create': 'إنشاء مجلد فرعي', 'file.upload': 'رفع ملف', 'file.update': 'تعديل شاهد', 'file.trash': 'حذف شاهد', 'folder.trash': 'حذف مجلد', 'file.download': 'تنزيل ملف', 'profile.update': 'تعديل الترويسة', 'viewer.add': 'إضافة مطّلع', 'viewer.remove': 'إزالة مطّلع', 'backup.download': 'تنزيل نسخة احتياطية', 'backup.restore': 'استعادة نسخة', 'backup.drive': 'نسخة احتياطية في Drive' };
async function tabLog(t) {
  const rows = await api('GET', '/api/audit?limit=200');
  t.innerHTML = `<section class="card"><h3>${icon('clock')} سجل العمليات (آخر 200)</h3><div style="overflow:auto"><table class="table"><thead><tr><th>الوقت</th><th>المستخدم</th><th>العملية</th><th>التفاصيل</th></tr></thead><tbody>
    ${rows.map((r) => { let d = ''; try { const j = JSON.parse(r.details || 'null'); d = j?.name || j?.from || (j ? JSON.stringify(j).slice(0, 80) : ''); } catch { /* */ } return `<tr><td class="small">${dateTime(r.at)}</td><td class="small">${esc(r.email || '')}</td><td>${esc(ACTIONS[r.action] || r.action)}</td><td class="small muted">${esc(d || r.target || '')}</td></tr>`; }).join('') || '<tr><td colspan="4" class="muted">لا توجد عمليات</td></tr>'}</tbody></table></div></section>`;
}

async function tabLimits(t) {
  let q = null; try { if (S.me.drive.connected) q = await api('GET', '/api/storage'); } catch { /* */ }
  t.innerHTML = `<section class="card"><h3>${icon('cloud')} التخزين والحدود الفعلية</h3>
    ${q ? `<div class="progress" style="height:12px"><i style="width:${q.limit ? Math.min(100, (q.usage / q.limit) * 100) : 3}%"></i></div><p>المستخدم <b>${bytes(q.usage)}</b> ${q.limit ? `من <b>${bytes(q.limit)}</b> — المتبقي <b>${bytes(q.limit - q.usage)}</b>` : '(حساب بلا حد محدد)'} · منها في Drive ${bytes(q.usageInDrive)} وفي سلة المهملات ${bytes(q.usageInDriveTrash)}.</p>` : '<p class="muted">اربطي Drive لعرض المساحة.</p>'}
    <ul class="small" style="line-height:2">
      <li>التخزين الأساسي لجميع الشواهد هو حساب Google Drive المرتبط؛ المنصة لا تحتفظ بنسخ من الملفات.</li>
      <li>مساحة حساب Google المجاني 15 جيجابايت مشتركة بين Drive وGmail وصور Google، ويمكن زيادتها باشتراك Google One. المساحة ليست غير محدودة.</li>
      <li>أقصى حجم للملف الواحد في Google Drive هو 5 تيرابايت، وحد الرفع اليومي 750 جيجابايت لكل حساب (حدود Google).</li>
      <li>لا تضع المنصة حدًا مصطنعًا لحجم الملفات. الرفع يتم بأجزاء 8 ميجابايت عبر الخادم مع استئناف تلقائي؛ لذا سرعة الرفع مرتبطة بسرعة الاستضافة.</li>
      <li>الحذف من المنصة ينقل الملف إلى سلة مهملات Drive ويمكن استرجاعه خلال 30 يومًا.</li>
    </ul></section>`;
}

// ======================= الموجّه =======================
const VIEWS = { '': viewHome, dashboard: viewDashboard, section: viewSection, search: viewSearch, reports: viewReports, assistant: viewAssistant, settings: viewSettings };
async function route() {
  const { name, arg, q } = parseHash();
  if (name === 'login' || !S.me) {
    if (!S.me) { try { await refreshMe(); } catch (e) { if (e.status === 401 || e.status === 0) { renderLogin(q); return; } throw e; } }
    if (name === 'login') { location.hash = '#/'; return; }
  }
  const view = VIEWS[name] ? name : '';
  if (view === 'assistant' && !isOwner()) { go('#/'); return; }
  const v = renderShell(view === 'section' ? '' : view);
  window.scrollTo(0, 0);
  try {
    if (view === 'section') await viewSection(v, arg, q);
    else await VIEWS[view](v, q);
  } catch (e) {
    if (e.status !== 401) v.innerHTML = `<div class="alert bad" style="margin-top:20px">${icon('alert')}<div>${esc(e.message)}</div></div>`;
  }
}
window.addEventListener('hashchange', route);
route();
