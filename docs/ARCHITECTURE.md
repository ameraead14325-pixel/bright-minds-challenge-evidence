# البنية التقنية

```
المتصفح (جوال / آيباد / حاسب)
   │  HTTPS — كوكي جلسة HttpOnly فقط (لا رموز Google)
   ▼
خادم Node.js (server/)
   ├── /auth/*   OAuth 2.0 مع Google (state + كوكي ربط لمنع CSRF)
   ├── /api/*    واجهة API مع فحص الصلاحية (مالكة / مطّلعة) لكل مسار
   ├── SQLite    إعدادات + ربط الأقسام + فهرس + جلسات + سجلات
   └── Google APIs (OAuth token endpoint + Drive v3) برموز مشفّرة
            ▼
      Google Drive الخاص بالمعلمة (التخزين الأساسي لكل الملفات)
```

## مخطط قاعدة البيانات (`db/schema.sql`)
| الجدول | الغرض |
|---|---|
| `settings` | قيم JSON: `profile` (الترويسة)، و`root_folder`، و`last_sync_all`، و`backup_file_id` |
| `sections` | المعايير الإحدى عشرة: `folder_id` (فريد)، و`folder_name`، و`target_count`، و`last_sync` |
| `files` | فهرس وصفي فقط: `drive_id` (مفتاح أساسي يمنع التكرار)، و`section_key`، و`parent_id`، و`path`، والاسم، والنوع، والحجم، والتواريخ، و`evidence_type`، والوصف |
| `users` | المستخدمون المصرّح لهم ودورهم وآخر دخول |
| `sessions` | تجزئة SHA-256 لمعرّف الجلسة، مع انتهاء بعد 30 يومًا |
| `oauth_states` | قيم state مؤقتة (15 دقيقة) |
| `google_tokens` | رمز التحديث ورمز الوصول، مشفّران AES-256-GCM |
| `uploads` | جلسات الرفع القابلة للاستئناف (رابط جلسة Google مشفّر) |
| `audit_log` | سجل العمليات |

بيانات تصنيف الشاهد (النوع والتاريخ) تُحفظ أيضًا **داخل الملف نفسه في Drive** في `appProperties` وحقل `description`، فلا تضيع حتى لو أُعيد بناء قاعدة البيانات، وتعود بمجرد المزامنة.

## الأمان
- Client Secret ومفتاح التشفير ومفتاح الذكاء الاصطناعي متغيرات بيئة في الخادم فقط. يتحقق الاختبار 16 من خلو كود الواجهة منها.
- رموز Google لا تغادر الخادم. المتصفح يرفع الأجزاء إلى الخادم، والخادم يمررها إلى جلسة Google.
- كل وصول إلى ملف (معاينة أو تنزيل أو تعديل أو حذف) يجب أن يكون لملف مفهرس داخل مجلد قسم مرتبط. ملفات Drive الأخرى غير قابلة للوصول (الاختبار 4).
- حماية CSRF: ترويسة `X-Requested-With` إلزامية، وفحص `Origin`، وكوكي `SameSite=Lax`، وكوكي `__Host-` على HTTPS.
- ترويسات CSP وHSTS وnosniff وX-Frame-Options. ملفات HTML وSVG تُنزَّل ولا تُعرض داخل المنصة.
- الحذف يعني النقل إلى سلة Drive (قابل للاسترجاع)، ولا حذف نهائي من المنصة.
- إعادة فحص الصلاحية مع كل طلب، فإزالة المطّلعة تنهي وصولها فورًا.

## المزامنة
- لكل قسم: مسح BFS لمجلده حتى عمق 8 مستويات، ثم تحديث الفهرس داخل معاملة واحدة (إضافة وتحديث وحذف ما أُزيل من Drive).
- تجري يدويًا أو تلقائيًا عند فتح القسم (بعد دقيقتين) أو الرئيسية (بعد 10 دقائق).
- الملفات المضافة مباشرة في Drive خارج المنصة تظهر بعد المزامنة.

## الرفع القابل للاستئناف
1. `POST /api/uploads` يتحقق من القسم والمجلد والتكرار والمساحة، ثم ينشئ جلسة Resumable لدى Google.
2. `PUT /api/uploads/:id` يستقبل أجزاء 8MB مع `Content-Range` ويمررها إلى Google.
3. `GET /api/uploads/:id/status` يستعلم من Google عن آخر بايت مستلم، فيستأنف المتصفح منه.
4. عند الاكتمال يتحقق الخادم من مكان الملف الفعلي في Drive ويضيفه إلى فهرس القسم.

## الاختبارات (`npm test`)
`tests/e2e.test.js` يشغّل الخادم الحقيقي وقاعدة بياناته مقابل `tests/google-emulator.js`، وهو محاكٍ محلي لواجهات Google يُستخدم **في الاختبار فقط**. يغطي 17 سيناريو، منها: تسجيل الدخول وربط Drive، واختيار المجلد، والمطابقة التلقائية، والربط، ورفع ملف بحجم 9MB على جزأين مع الاستئناف والتحقق من تطابق المحتوى، ومنع التكرار، والتنزيل والمعاينة، والبحث، والتعديل، وتجديد الرمز تلقائيًا، والحذف، والاستمرارية بعد إعادة التشغيل، ودخول جهاز آخر بصلاحية اطلاع، ورفض الغرباء، وCSRF، وعدم تسرب الأسرار، والنسخ الاحتياطي.

`tests/ui-demo.mjs` يشغّل المنصة مقابل المحاكي لمعاينة الواجهة محليًا أثناء التطوير.

## نقاط API
`GET /api/me` · `GET /api/sections` · `GET /api/sections/:key` · `GET /api/sections/:key/files` · `POST /api/sections/:key/sync` · `POST /api/sync` · `PATCH /api/sections/:key` · `POST /api/sections/:key/folders` · `GET /api/search` · `GET|PATCH|DELETE /api/files/:id` · `GET /api/files/:id/content` · `GET /api/files/:id/thumbnail` · `GET /api/dashboard` · `GET /api/storage` · `GET /api/drive/folders` · `POST /api/settings/root` · `GET|POST /api/mapping` · `POST /api/mapping/create-missing` · `POST /api/drive/disconnect` · `PUT /api/settings/profile` · `GET|POST|DELETE /api/viewers` · `GET /api/audit` · `GET /api/backup` · `POST /api/backup/restore` · `POST /api/backup/drive` · `POST /api/uploads` · `PUT /api/uploads/:id` · `GET /api/uploads/:id/status` · `POST /api/assistant`
