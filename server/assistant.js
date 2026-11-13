// «مساعد شواهد الأداء»: اقتراحات مبنية على قواعد دائمًا، وتحليل محتوى بنموذج ذكاء اصطناعي حقيقي فقط إذا ضُبط ANTHROPIC_API_KEY
import { config } from './config.js';
import { db } from './db.js';
import { SECTIONS, sectionDef, EVIDENCE_TYPES, normalizeArabic } from './sections.js';
import { gfetch, EXPORTS } from './google.js';
import { AppError } from './http.js';

export const aiEnabled = () => !!config.anthropicKey;

const words = (s) => normalizeArabic(s).replace(/[^\p{L}\s]/gu, ' ').split(/\s+/).map((w) => w.replace(/^(ال|وال|بال)/, '')).filter((w) => w.length > 2);
const hijri = (iso) => { try { return new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso)); } catch { return iso; } };
const ext = (name) => (name.match(/\.([a-z0-9]{1,5})$/i) || [, ''])[1];
const baseName = (name) => name.replace(/\.[a-z0-9]{1,5}$/i, '');

function fileRow(id) {
  const f = db.prepare('SELECT * FROM files WHERE drive_id = ? AND is_folder = 0').get(id);
  if (!f) throw new AppError(404, 'NO_FILE', 'الشاهد غير موجود في الفهرس');
  return f;
}

function missingFor(key) {
  const sec = db.prepare('SELECT * FROM sections WHERE key = ?').get(key);
  const def = sectionDef(key);
  const files = db.prepare('SELECT name, evidence_type FROM files WHERE section_key = ? AND is_folder = 0').all(key);
  const corpus = new Set(files.flatMap((f) => words(`${f.name} ${f.evidence_type || ''}`)));
  const missing = def.suggestions.filter((s) => {
    const w = words(s);
    const hit = w.filter((x) => [...corpus].some((c) => c.startsWith(x.slice(0, 4)))).length;
    return hit / Math.max(w.length, 1) < 0.5;
  });
  return { key, title: def.title, count: files.length, target: sec.target_count, missing, mapped: !!sec.folder_id };
}

function suggestName(f) {
  const def = sectionDef(f.section_key);
  const type = f.evidence_type && f.evidence_type !== 'غير مصنف' ? f.evidence_type : 'شاهد';
  const date = (f.evidence_date || f.created_time || '').slice(0, 10);
  let title = baseName(f.name).replace(/^(img|image|scan|doc|photo|whatsapp|screenshot)[-_ ]?\w*/i, '').replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!title || /^[\d\s-]+$/.test(title)) title = def.title;
  const e = ext(f.name) || (EXPORTS[f.mime_type] ? '' : '');
  return `${type} - ${title} - ${date}${e ? '.' + e.toLowerCase() : ''}`.replace(/\s+-\s+-/g, ' -');
}

function classify(f) {
  const scores = SECTIONS.map((s) => {
    const kw = words(`${s.title} ${s.suggestions.join(' ')}`);
    const nw = words(`${f.name} ${f.description || ''}`);
    const hit = nw.filter((w) => kw.some((k) => k.startsWith(w.slice(0, 4)))).length;
    return { key: s.key, title: s.title, score: Math.round((hit / Math.max(nw.length, 1)) * 100) / 100 };
  }).sort((a, b) => b.score - a.score);
  return { evidenceType: f.evidence_type, typeInferred: !!f.type_inferred, currentSection: sectionDef(f.section_key).title, bestSections: scores.slice(0, 3).filter((s) => s.score > 0) };
}

function describe(f) {
  const def = sectionDef(f.section_key);
  const type = f.evidence_type && f.evidence_type !== 'غير مصنف' ? f.evidence_type : 'شاهد';
  const desc = f.description ? ` ${f.description}` : '';
  return `${type} بعنوان «${baseName(f.name)}» يوثّق معيار «${def.title}»، بتاريخ ${hijri(f.evidence_date || f.created_time)}، ضمن العام الدراسي 1448هـ.${desc}`;
}

async function callClaude(content) {
  const r = await fetch(config.anthropicUrl, {
    method: 'POST',
    headers: { 'x-api-key': config.anthropicKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: config.anthropicModel, max_tokens: 1200, messages: [{ role: 'user', content }] }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new AppError(502, 'AI_ERROR', `تعذر الاتصال بنموذج الذكاء الاصطناعي: ${j?.error?.message || r.status}`);
  return (j.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n');
}

async function summarize(f) {
  if (!aiEnabled()) throw new AppError(400, 'AI_DISABLED', 'تلخيص المحتوى يحتاج ربط نموذج ذكاء اصطناعي حقيقي (ANTHROPIC_API_KEY). الاقتراحات الأخرى تعمل بالقواعد.');
  const blocks = [];
  const exp = EXPORTS[f.mime_type];
  const MAX = 15 * 1024 * 1024;
  if (exp?.text) {
    const r = await gfetch(`/drive/v3/files/${f.drive_id}/export`, { query: { mimeType: exp.text }, raw: true });
    if (!r.ok) throw new AppError(502, 'EXPORT', 'تعذر قراءة محتوى المستند');
    blocks.push({ type: 'text', text: `محتوى الملف:\n${(await r.text()).slice(0, 60000)}` });
  } else if (f.size && f.size > MAX) {
    throw new AppError(413, 'AI_TOO_LARGE', 'الملف أكبر من الحد المسموح للتحليل (15MB)');
  } else if (f.mime_type === 'application/pdf' || /^image\/(png|jpeg|gif|webp)$/.test(f.mime_type) || /^text\//.test(f.mime_type)) {
    const r = await gfetch(`/drive/v3/files/${f.drive_id}`, { query: { alt: 'media' }, raw: true });
    if (!r.ok) throw new AppError(502, 'DOWNLOAD', 'تعذر تنزيل الملف للتحليل');
    const buf = Buffer.from(await r.arrayBuffer());
    if (f.mime_type === 'application/pdf') blocks.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: buf.toString('base64') } });
    else if (f.mime_type.startsWith('image/')) blocks.push({ type: 'image', source: { type: 'base64', media_type: f.mime_type, data: buf.toString('base64') } });
    else blocks.push({ type: 'text', text: `محتوى الملف:\n${buf.toString('utf8').slice(0, 60000)}` });
  } else {
    throw new AppError(415, 'AI_UNSUPPORTED', 'نوع الملف غير مدعوم للتحليل (المدعوم: PDF، الصور، مستندات Google، النصوص)');
  }
  const def = sectionDef(f.section_key);
  blocks.push({ type: 'text', text: `أنت مساعد لمعلمة علوم سعودية في توثيق شواهد الأداء الوظيفي (العام 1448هـ).
الملف «${f.name}» موجود ضمن معيار «${def.title}».
أعد JSON فقط بالمفاتيح: summary (تلخيص 2-4 جمل)، description (وصف مختصر للشاهد بجملة أو جملتين)، suggestedName (اسم ملف احترافي بالعربية بدون امتداد)، evidenceType (واحد من: ${EVIDENCE_TYPES.join('، ')})، fitsSection (true/false هل يناسب المعيار)، betterSection (اسم معيار أنسب إن وجد أو null).` });
  const text = await callClaude(blocks);
  const m = text.match(/\{[\s\S]*\}/);
  let data; try { data = JSON.parse(m ? m[0] : text); } catch { data = { summary: text }; }
  if (data.suggestedName && ext(f.name)) data.suggestedName += '.' + ext(f.name).toLowerCase();
  return { ...data, ai: true, model: config.anthropicModel };
}

export async function runAssistant(action, body) {
  switch (action) {
    case 'suggest_types': {
      const def = sectionDef(body.sectionKey);
      if (!def) throw new AppError(400, 'NO_SECTION', 'حددي القسم');
      return { title: def.title, suggestions: def.suggestions, ai: false };
    }
    case 'missing':
      return { sections: (body.sectionKey ? [body.sectionKey] : SECTIONS.map((s) => s.key)).map(missingFor), ai: false };
    case 'classify': return { ...classify(fileRow(body.fileId)), ai: false };
    case 'name': return { suggestedName: suggestName(fileRow(body.fileId)), ai: false };
    case 'describe': return { description: describe(fileRow(body.fileId)), ai: false };
    case 'summarize': return summarize(fileRow(body.fileId));
    default: throw new AppError(400, 'BAD_ACTION', 'إجراء غير معروف');
  }
}
