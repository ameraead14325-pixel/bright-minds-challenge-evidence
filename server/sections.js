// تعريف المعايير الإحدى عشرة، وأنواع الشواهد، وخوارزمية اقتراح مطابقة المجلدات
export const SECTIONS = [
  {
    key: 'duties', title: 'أداء الواجبات الوظيفية', icon: 'badge',
    desc: 'الالتزام بالدوام الرسمي، وتأدية الحصص وفق الجدول، والمشاركة في الإشراف والمناوبة واللجان، وتنفيذ التكاليف المدرسية.',
    suggestions: ['سجل الدوام والانضباط', 'جدول الحصص والمناوبة والإشراف', 'قرارات وتكاليف اللجان المدرسية', 'خطابات شكر وتقدير', 'ميثاق أخلاقيات مهنة التعليم'],
  },
  {
    key: 'plan', title: 'إعداد وتنفيذ خطة التعلم', icon: 'plan',
    desc: 'إعداد خطة توزيع المنهج وتحضير الدروس وتحديد الأهداف والأنشطة وتنفيذها بما يتوافق مع الزمن المخصص.',
    suggestions: ['خطة توزيع المنهج الفصلية', 'نماذج من تحضير الدروس', 'خطة علاجية وإثرائية', 'متابعة تنفيذ الخطة (نسبة الإنجاز)', 'أوراق عمل مرتبطة بالخطة'],
  },
  {
    key: 'classroom', title: 'الإدارة الصفية', icon: 'class',
    desc: 'ضبط بيئة الصف وإدارة الوقت وتعزيز السلوك الإيجابي وبناء قواعد صفية واضحة يشارك فيها المتعلمون.',
    suggestions: ['القوانين الصفية المتفق عليها', 'لوحة أو سجل التعزيز والتحفيز', 'صور توثيقية للصف', 'سجل متابعة السلوك', 'توزيع المهام والأدوار الصفية'],
  },
  {
    key: 'community', title: 'التفاعل مع المجتمع المهني', icon: 'network',
    desc: 'المشاركة في مجتمعات التعلم المهنية وتبادل الزيارات والدورات والورش وحضور اللقاءات التربوية.',
    suggestions: ['شهادات الدورات والورش التدريبية', 'تبادل الزيارات الصفية', 'محاضر مجتمعات التعلم المهنية', 'تقديم درس نموذجي أو ورشة', 'المشاركة في المبادرات والمسابقات'],
  },
  {
    key: 'strategies', title: 'التنوع في استراتيجيات التعلم', icon: 'bulb',
    desc: 'توظيف استراتيجيات تعلم نشط متنوعة تراعي الفروق الفردية وأنماط التعلم وتحفز التفكير.',
    suggestions: ['نماذج دروس باستراتيجيات تعلم نشط', 'صور تطبيق الاستراتيجيات', 'أوراق عمل متمايزة', 'ملف الاستراتيجيات المنفذة', 'تقارير تنفيذ استراتيجية'],
  },
  {
    key: 'parents', title: 'التواصل مع أولياء الأمور', icon: 'chat',
    desc: 'بناء قنوات تواصل فاعلة مع أولياء الأمور لإطلاعهم على مستوى أبنائهم وإشراكهم في العملية التعليمية.',
    suggestions: ['سجل التواصل مع أولياء الأمور', 'رسائل وإشعارات مرسلة', 'محاضر اجتماعات الجمعية العمومية', 'استبانات رأي أولياء الأمور', 'تقارير مستوى الطالبات المرسلة'],
  },
  {
    key: 'results', title: 'تحسين نتائج المتعلمين', icon: 'growth',
    desc: 'تنفيذ خطط علاجية وإثرائية ومتابعة تقدم المتعلمين وقياس أثر التدخلات على تحسن النتائج.',
    suggestions: ['خطط علاجية للمتعثرات', 'برامج إثرائية للمتفوقات', 'مقارنة النتائج قبل وبعد', 'شهادات تفوق وتكريم', 'تقارير الاختبارات الوطنية (نافس)'],
  },
  {
    key: 'analysis', title: 'تحليل نتائج المتعلمين وتشخيص مستوياتهم', icon: 'chart',
    desc: 'تطبيق اختبارات تشخيصية وتحليل النتائج إحصائيًا وتصنيف المتعلمين وبناء القرارات التعليمية عليها.',
    suggestions: ['الاختبار التشخيصي ونتائجه', 'جداول تحليل النتائج', 'رسوم بيانية للمستويات', 'تصنيف الطالبات حسب المستوى', 'تقرير تحليل نتائج الاختبارات'],
  },
  {
    key: 'assessment', title: 'تنويع أساليب التقويم', icon: 'check',
    desc: 'استخدام أدوات تقويم متنوعة: الاختبارات، وملفات الإنجاز، وسلالم التقدير، والتقويم الذاتي وتقويم الأقران.',
    suggestions: ['نماذج اختبارات قصيرة وتحريرية', 'سلالم التقدير وقوائم الرصد', 'ملفات إنجاز الطالبات', 'تقويم ذاتي وتقويم أقران', 'اختبارات إلكترونية'],
  },
  {
    key: 'environment', title: 'تهيئة البيئة التعليمية', icon: 'school',
    desc: 'تهيئة بيئة صفية آمنة ومحفزة ومنظمة، وتوفير الوسائل والأركان التعليمية ومعمل العلوم.',
    suggestions: ['صور تهيئة الصف والأركان التعليمية', 'تجهيز معمل العلوم', 'اللوحات والوسائل التعليمية', 'إجراءات السلامة في المعمل', 'تهيئة الطالبات للدرس'],
  },
  {
    key: 'tech', title: 'توظيف تقنيات ووسائل التعلم', icon: 'robot',
    desc: 'توظيف التقنية والمنصات الرقمية والوسائل التعليمية والمحاكاة والتجارب الافتراضية في التعليم.',
    suggestions: ['استخدام منصة مدرستي', 'عروض تقديمية تفاعلية', 'مقاطع فيديو تعليمية', 'تطبيقات وأدوات رقمية مستخدمة', 'تجارب ومحاكاة افتراضية'],
  },
];

export const SECTION_KEYS = SECTIONS.map((s) => s.key);
export const sectionDef = (key) => SECTIONS.find((s) => s.key === key);

export const EVIDENCE_TYPES = [
  'خطة', 'تقرير', 'صور توثيقية', 'شهادة', 'نموذج أو استمارة', 'عرض تقديمي', 'ورقة عمل',
  'اختبار أو أداة تقويم', 'تحليل نتائج', 'محضر أو سجل', 'فيديو', 'تواصل ورسائل', 'أخرى',
];

export const DEFAULT_PROFILE = {
  platformName: 'سجل شواهد الأداء الوظيفي 1448هـ',
  teacher: 'أ. فاطمة محمد',
  specialty: 'معلمة العلوم',
  school: 'الابتدائية الثامنة والعشرون بتبوك',
  principal: 'أ. ظاهره العنزي',
  authority: 'إدارة تعليم تبوك',
  year: '1448هـ',
};

// تخمين نوع الشاهد عند عدم تصنيفه يدويًا
export function inferEvidenceType(mime, name = '') {
  const n = name.toLowerCase();
  if (mime.startsWith('image/')) return 'صور توثيقية';
  if (mime.startsWith('video/')) return 'فيديو';
  if (mime.includes('presentation') || /\.pptx?$/.test(n)) return 'عرض تقديمي';
  if (/شهاد|certificate/.test(n)) return 'شهادة';
  if (/خطة|plan/.test(n)) return 'خطة';
  if (/تقرير|report/.test(n)) return 'تقرير';
  if (/اختبار|تقويم|quiz|exam/.test(n)) return 'اختبار أو أداة تقويم';
  if (/تحليل/.test(n) || mime.includes('spreadsheet')) return 'تحليل نتائج';
  if (/ورق(ة|ه) عمل/.test(n)) return 'ورقة عمل';
  if (/محضر|سجل/.test(n)) return 'محضر أو سجل';
  return 'غير مصنف';
}

// ---------- المطابقة التلقائية بين أسماء المجلدات وأسماء الأقسام ----------
const STOP = new Set(['و', 'في', 'مع', 'من', 'على', 'الى', 'الي', 'عن']);
export function normalizeArabic(s) {
  return String(s || '')
    .replace(/[ً-ْـ]/g, '')       // التشكيل والتطويل
    .replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي')
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .toLowerCase();
}
function tokens(s) {
  return normalizeArabic(s)
    .replace(/[^\p{L}\s]/gu, ' ')
    .split(/\s+/)
    .map((w) => w.replace(/^(وال|بال|فال|كال|لل|ال)/, '').replace(/^و(?=\S{3,})/, ''))
    .filter((w) => w.length > 1 && !STOP.has(w))
    .map((w) => w.length > 4 ? w.replace(/(ات|ين|ون|يه|ه)$/, '') : w);
}
function leadingNumber(s) {
  const m = normalizeArabic(s).match(/^\s*(\d{1,2})(?!\d)/);
  return m ? Number(m[1]) : null;
}

export function matchScore(section, folderName, index) {
  const a = new Set(tokens(section.title));
  const b = new Set(tokens(folderName));
  if (!b.size) return 0;
  let common = 0;
  for (const t of a) if ([...b].some((x) => x === t || (t.length > 3 && (x.startsWith(t) || t.startsWith(x))))) common++;
  let score = common / Math.max(a.size, 1);
  const num = leadingNumber(folderName);
  if (num !== null && num === index + 1) score += 0.25;
  return Math.min(1, Math.round(score * 100) / 100);
}

// يعيد لكل قسم أفضل مجلد مقترح (مطابقة جشعة دون تكرار المجلد)
export function suggestMapping(folders) {
  const pairs = [];
  SECTIONS.forEach((s, i) => folders.forEach((f) => {
    const sc = matchScore(s, f.name, i);
    if (sc >= 0.34) pairs.push({ key: s.key, folderId: f.id, folderName: f.name, score: sc });
  }));
  pairs.sort((x, y) => y.score - x.score);
  const used = new Set(); const out = {};
  for (const p of pairs) {
    if (out[p.key] || used.has(p.folderId)) continue;
    out[p.key] = p; used.add(p.folderId);
  }
  return out;
}
