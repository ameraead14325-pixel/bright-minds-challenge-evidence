// رفع الملفات إلى Google Drive عبر الخادم بأجزاء قابلة للاستئناف (Resumable Upload)
import { api, ApiError, esc, icon, modal, $, $$, bytes, toast } from './ui.js';

const RESUME_KEY = 'sjl_resume_v1';
const readResume = () => { try { return JSON.parse(localStorage.getItem(RESUME_KEY) || '{}'); } catch { return {}; } };
const writeResume = (o) => { try { localStorage.setItem(RESUME_KEY, JSON.stringify(o)); } catch { /* التخزين غير متاح */ } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function putChunk(uploadId, blob, start, end, total, onProgress) {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open('PUT', `/api/uploads/${uploadId}`);
    x.setRequestHeader('X-Requested-With', 'sjl');
    x.setRequestHeader('Content-Type', 'application/octet-stream');
    if (total > 0) x.setRequestHeader('Content-Range', `bytes ${start}-${end}/${total}`);
    x.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded);
    x.onload = () => {
      let j = null; try { j = JSON.parse(x.responseText); } catch { /* */ }
      if (x.status >= 200 && x.status < 300) resolve(j); else reject(new ApiError(x.status, j));
    };
    x.onerror = () => reject(new ApiError(0, { error: { code: 'OFFLINE', message: 'انقطع الاتصال أثناء الرفع' } }));
    x.send(blob);
  });
}

// يرفع ملفًا واحدًا ويعيد بيانات الشاهد بعد تسجيله في القسم
export async function uploadFile({ file, sectionKey, parentId, name, evidenceType, evidenceDate, description, force }, onProgress) {
  const sig = [sectionKey, parentId || '', name, file.size, file.lastModified].join('|');
  const resume = readResume();
  let uploadId; let chunk; let next = 0;
  if (resume[sig]) {
    try {
      const st = await api('GET', `/api/uploads/${resume[sig].id}/status`);
      if (st.done) { delete resume[sig]; writeResume(resume); return st.file; }
      ({ id: uploadId, chunk } = resume[sig]); next = st.next;
    } catch { delete resume[sig]; writeResume(resume); }
  }
  if (!uploadId) {
    const init = await api('POST', '/api/uploads', { sectionKey, parentId, name, originalName: file.name, size: file.size, mimeType: file.type || undefined, evidenceType, evidenceDate, description, force });
    uploadId = init.uploadId; chunk = init.chunkSize;
    const r = readResume(); r[sig] = { id: uploadId, chunk, at: Date.now() }; writeResume(r);
  }
  const clear = () => { const r = readResume(); delete r[sig]; writeResume(r); };
  if (file.size === 0) { const res = await putChunk(uploadId, new Blob([]), 0, 0, 0, () => {}); clear(); return res.file; }
  onProgress(next / file.size);
  while (next < file.size) {
    const end = Math.min(next + chunk, file.size) - 1;
    let res = null; let moved = false;
    for (let attempt = 0; attempt < 6 && !res; attempt++) {
      try {
        res = await putChunk(uploadId, file.slice(next, end + 1), next, end, file.size, (l) => onProgress((next + l) / file.size));
      } catch (e) {
        if (e.status === 410) { clear(); throw e; }
        if (e.status >= 400 && e.status < 500 && e.status !== 408 && e.status !== 429) throw e;
        await sleep(Math.min(15000, 1000 * 2 ** attempt));
        try { // معرفة ما استلمته Google فعلًا ثم الاستئناف منه
          const st = await api('GET', `/api/uploads/${uploadId}/status`);
          if (st.done) { clear(); return st.file; }
          if (st.next !== next) { next = st.next; moved = true; break; }
        } catch { /* نعيد المحاولة */ }
      }
    }
    if (!res) { if (moved) continue; throw new ApiError(0, { error: { message: 'تعذر إكمال الرفع بعد عدة محاولات. أعيدي اختيار الملف لاستئنافه.' } }); }
    if (res.done) { clear(); onProgress(1); return res.file; }
    next = res.next;
  }
  const st = await api('GET', `/api/uploads/${uploadId}/status`);
  clear();
  return st.file;
}

const extOf = (n) => (n.match(/\.[a-z0-9]{1,5}$/i) || [''])[0];

export function openUploadModal({ section, me, mode = 'files', defaultFolder = '', onDone }) {
  const types = me.evidenceTypes;
  const folderOpts = [`<option value="">المجلد الرئيسي للقسم</option>`, ...section.folders.map((f) => `<option value="${esc(f.id)}" ${f.id === defaultFolder ? 'selected' : ''}>${esc(f.path.split(' / ').slice(1).concat(f.name).join(' / '))}</option>`)].join('');
  const today = new Date().toISOString().slice(0, 10);
  const isEv = mode === 'evidence';
  const body = `
    ${isEv ? `<div class="form-grid">
      <label class="f full">عنوان الشاهد (سيصبح اسم الملف)<input class="input" name="title" placeholder="مثال: خطة علاجية للمتعثرات - الفصل الأول" maxlength="150"></label>
      <label class="f">نوع الشاهد<select class="input" name="evType">${types.map((t) => `<option>${esc(t)}</option>`).join('')}</select></label>
      <label class="f">تاريخ الشاهد<input class="input" type="date" name="evDate" value="${today}"></label>
      <label class="f full">وصف مختصر<textarea class="input" name="desc" rows="2" maxlength="600" placeholder="ماذا يوثّق هذا الشاهد؟"></textarea></label>
    </div>` : `<div class="form-grid">
      <label class="f">نوع الشاهد<select class="input" name="evType"><option value="">تصنيف تلقائي حسب نوع الملف</option>${types.map((t) => `<option>${esc(t)}</option>`).join('')}</select></label>
      <label class="f">تاريخ الشواهد<input class="input" type="date" name="evDate" value="${today}"></label>
    </div>`}
    <label class="f">مكان الحفظ داخل القسم<select class="input" name="folder">${folderOpts}</select></label>
    <div class="dropzone" tabindex="0" role="button" aria-label="اختيار ملفات">
      ${icon('upload')}<div><b>${isEv ? 'اختاري ملف الشاهد' : 'اسحبي الملفات هنا أو انقري للاختيار'}</b></div>
      <div class="muted small">PDF، Word، Excel، PowerPoint، صور، فيديو وجميع ما يدعمه Google Drive — الحد هو مساحة حسابك في Drive</div>
      <input type="file" hidden ${isEv ? '' : 'multiple'}>
    </div>
    <label class="row small"><input type="checkbox" name="skipDup" checked> تخطي الملفات المكررة (نفس الاسم والحجم في هذا القسم)</label>
    <div class="uplist"></div>`;
  const m = modal({
    title: `${isEv ? 'إضافة شاهد' : 'رفع ملفات'} — ${section.title}`, body,
    foot: `<button class="btn primary" data-start>${icon('upload')} بدء الرفع</button><button class="btn" data-close>إغلاق</button><span class="muted small" data-sum></span>`,
    onClose: () => { if (uploadedAny) onDone?.(); },
  });
  let items = []; let uploadedAny = false; let running = false;
  const dz = $('.dropzone', m.el); const input = $('input[type=file]', m.el); const listEl = $('.uplist', m.el);
  const render = () => {
    listEl.innerHTML = items.map((it, i) => `<div class="upitem" data-i="${i}">
      <span class="nm" title="${esc(it.file.name)}">${esc(it.file.name)}</span>
      <span class="small">${it.status === 'done' ? `<span class="badge ok">تم ✓</span>` : it.status === 'error' ? `<span class="badge bad">فشل</span>` : it.status === 'dup' ? `<span class="badge warn">مكرر — تم التخطي</span> <button class="btn sm" data-force="${i}">رفع رغم ذلك</button>` : it.status === 'up' ? `${Math.round(it.p * 100)}%` : `${bytes(it.file.size)}${running ? '' : ` <button class="btn sm ghost" data-rm="${i}" aria-label="إزالة">${icon('x')}</button>`}`}</span>
      <div class="progress ${it.status === 'done' ? 'ok' : ''}"><i style="width:${Math.round((it.p || 0) * 100)}%"></i></div>
      ${it.err ? `<span class="small" style="color:var(--bad);grid-column:1/-1">${esc(it.err)}</span>` : ''}</div>`).join('');
    const total = items.reduce((a, b) => a + b.file.size, 0);
    $('[data-sum]', m.el).textContent = items.length ? `${items.length} ملف — ${bytes(total)}` : '';
  };
  const addFiles = (fl) => { const arr = [...fl].map((file) => ({ file, status: 'wait', p: 0 })); items = isEv ? arr.slice(0, 1) : items.concat(arr); render(); };
  dz.onclick = () => !running && input.click();
  dz.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } };
  input.onchange = () => { addFiles(input.files); input.value = ''; };
  dz.ondragover = (e) => { e.preventDefault(); dz.classList.add('drag'); };
  dz.ondragleave = () => dz.classList.remove('drag');
  dz.ondrop = (e) => { e.preventDefault(); dz.classList.remove('drag'); if (!running) addFiles(e.dataTransfer.files); };
  listEl.onclick = (e) => {
    const rm = e.target.closest('[data-rm]'); if (rm) { items.splice(Number(rm.dataset.rm), 1); render(); }
    const f = e.target.closest('[data-force]'); if (f) { const it = items[Number(f.dataset.force)]; it.status = 'wait'; it.force = true; it.err = ''; render(); start(); }
  };
  const field = (n) => $(`[name=${n}]`, m.el);

  async function runItem(it) {
    it.status = 'up'; render();
    let name = it.file.name;
    if (isEv) { const t = field('title').value.trim(); if (t) name = t.replace(/[\\/]/g, '-') + extOf(it.file.name); }
    try {
      await uploadFile({
        file: it.file, sectionKey: section.key, parentId: field('folder').value || undefined, name,
        evidenceType: field('evType').value || undefined, evidenceDate: field('evDate').value || undefined,
        description: isEv ? field('desc').value.trim() || undefined : undefined, force: it.force || !field('skipDup').checked,
      }, (p) => { it.p = p; const row = $(`.upitem[data-i="${items.indexOf(it)}"]`, listEl); if (row) { $('i', row).style.width = `${Math.round(p * 100)}%`; $('.small', row).textContent = `${Math.round(p * 100)}%`; } });
      it.status = 'done'; it.p = 1; uploadedAny = true;
    } catch (e) {
      if (e.code === 'DUPLICATE') { it.status = 'dup'; it.err = `موجود مسبقًا: ${e.body.existing?.path || ''} / ${e.body.existing?.name || ''}`; } else { it.status = 'error'; it.err = e.message; }
    }
    render();
  }
  async function start() {
    if (running) return;
    const queue = items.filter((i) => i.status === 'wait' || i.status === 'error');
    if (!queue.length) { toast(items.length ? 'لا توجد ملفات بانتظار الرفع' : 'اختاري ملفًا أولًا'); return; }
    if (isEv && !field('title').value.trim()) { field('title').focus(); toast('اكتبي عنوان الشاهد', 'bad'); return; }
    running = true; $('[data-start]', m.el).disabled = true;
    const workers = Array.from({ length: Math.min(2, queue.length) }, async () => { while (queue.length) await runItem(queue.shift()); });
    await Promise.all(workers);
    running = false; $('[data-start]', m.el).disabled = false; render();
    const ok = items.filter((i) => i.status === 'done').length; const bad = items.filter((i) => i.status === 'error').length;
    if (ok) toast(`تم رفع ${ok} ملف إلى Google Drive`, 'ok');
    if (bad) toast(`تعذر رفع ${bad} ملف — يمكنك إعادة المحاولة`, 'bad');
    if (isEv && ok && !bad) { m.close(); }
  }
  $('[data-start]', m.el).onclick = start;
  const guard = (e) => { if (running) { e.preventDefault(); e.returnValue = ''; } };
  window.addEventListener('beforeunload', guard);
  const obs = new MutationObserver(() => { if (!m.el.isConnected) { window.removeEventListener('beforeunload', guard); obs.disconnect(); } });
  obs.observe(document.getElementById('modal-root'), { childList: true });
  return m;
}
