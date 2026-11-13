# سجل شواهد الأداء الوظيفي 1448هـ

منصة ويب لإدارة شواهد الأداء الوظيفي للمعلمة **أ. فاطمة محمد** (معلمة العلوم — الابتدائية الثامنة والعشرون بتبوك — إدارة تعليم تبوك)، وهي مرتبطة فعليًا بحساب Google Drive عن طريق OAuth 2.0 وGoogle Drive API v3.

- الملفات تُخزَّن في **Google Drive الخاص بالمعلمة فقط**، والمنصة لا تحتفظ بنسخ منها.
- قاعدة بيانات SQLite تحفظ الإعدادات، وربط الأقسام بمعرّفات المجلدات (Folder IDs)، وفهرس الملفات، والسجلات.
- رموز Google تُحفظ **مشفّرة** (AES-256-GCM) في الخادم، ولا تصل إلى المتصفح. ولا يوجد أي Client Secret أو مفتاح في كود الواجهة.
- المشروع لا يحتاج إلى أي مكتبات خارجية (`dependencies: {}`)، ويكفي Node.js 22.13 أو أحدث.

## التشغيل السريع (محليًا)

```bash
cp .env.example .env        # ثم عبّئي القيم (راجعي docs/GOOGLE_SETUP.md)
npm run gen-key             # انسخي الناتج إلى TOKEN_ENCRYPTION_KEY
npm start                   # افتحي http://localhost:3000
npm test                    # 17 اختبارًا شاملًا لمسارات المنصة
```

## التوثيق

| الملف | المحتوى |
|---|---|
| [docs/GOOGLE_SETUP.md](docs/GOOGLE_SETUP.md) | إعداد Google Cloud وشاشة الموافقة وOAuth خطوة بخطوة |
| [docs/DEPLOY.md](docs/DEPLOY.md) | النشر العام، وربط النطاق، والقرص الدائم لقاعدة البيانات |
| [docs/USER_GUIDE.md](docs/USER_GUIDE.md) | ربط Drive، ووظيفة كل زر وكل قسم |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | البنية التقنية، ومخطط قاعدة البيانات، والأمان، والاختبارات |

## هيكل المشروع

```
server/            الخادم (Node.js بدون مكتبات)
  index.js         خادم HTTP، وترويسات الأمان، وحماية CSRF، والملفات الثابتة
  auth.js          تسجيل الدخول بحساب Google، والجلسات، والصلاحيات
  google.js        OAuth وتجديد الرموز وعمليات Drive API
  sync.js          مزامنة فهرس الملفات من مجلدات الأقسام
  routes.js        واجهة API الكاملة
  assistant.js     «مساعد شواهد الأداء»
  sections.js      المعايير الإحدى عشرة، وأنواع الشواهد، والمطابقة التلقائية
public/            الواجهة (HTML/CSS/JS، باتجاه RTL، متجاوبة)
db/schema.sql      مخطط قاعدة البيانات
tests/             اختبارات شاملة + محاكي Google للاختبار فقط
Dockerfile, render.yaml
```
