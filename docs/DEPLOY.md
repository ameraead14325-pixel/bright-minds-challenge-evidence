# النشر العام (رابط واحد يعمل على جميع الأجهزة)

المنصة خادم Node.js واحد يقدّم الواجهة وواجهة API معًا، وتحتاج إلى:
1. **Node.js 22.13 أو أحدث** (يستخدم قاعدة SQLite المدمجة في Node، فلا مكتبات تُثبَّت).
2. **قرص دائم** لملف قاعدة البيانات `DATABASE_PATH`، وإلا ضاعت الإعدادات والربط عند كل إعادة نشر. الملفات نفسها في Drive ولا تضيع أبدًا.
3. **HTTPS**، وهو إلزامي لـ Google OAuth في الإنتاج (تقدّمه جميع الاستضافات المذكورة تلقائيًا).

## الخيار المجاني (بلا بطاقة): Render Free + Upstash
خطة Render المجانية بلا قرص دائم، فتحفظ المنصة حالتها (الإعدادات، وربط الأقسام، والمستخدمين، والجلسات، ورموز Google) **مشفّرة** في Upstash Redis المجاني، وتستعيدها تلقائيًا عند كل تشغيل. فهرس الملفات يُعاد بناؤه من Drive بالمزامنة. هذا السيناريو مختبر آليًا في `tests/persist.test.js`.
1. console.upstash.com: سجّلي بحساب Google، ثم **Create Database** (نوع Redis، منطقة Frankfurt، الخطة Free).
2. من صفحة القاعدة، قسم **REST API**: انسخي `UPSTASH_REDIS_REST_URL` و`UPSTASH_REDIS_REST_TOKEN`.
3. في Render: **New ← Blueprint** والفرع الذي فيه `render.yaml` (الخطة free). أدخلي المتغيرات، ومنها قيمتا Upstash.
4. العيب الوحيد: الخدمة تنام بعد 15 دقيقة دون استخدام، فيستغرق أول فتح بعدها قرابة دقيقة.

## الخيار (أ): Render.com بخطة مدفوعة وقرص دائم
1. ارفعي مجلد المشروع إلى مستودع GitHub خاص (ملف `.env` مستبعد تلقائيًا عبر `.gitignore`).
2. في Render: **New ← Blueprint** واختاري المستودع. عدّلي `render.yaml` إلى `plan: starter` وأضيفي قسم `disk` (mountPath `/var/data`، و`DATABASE_PATH=/var/data/shawahid.db`).
3. الخطة **Starter** (حوالي 7$ شهريًا)، لأنها تدعم القرص الدائم `/var/data`. الخطة المجانية لا تحفظ قاعدة البيانات، فلا تستخدميها للتشغيل الفعلي.
4. أدخلي متغيرات البيئة. القيمة `APP_URL` هي الرابط الذي يعطيك إياه Render، مثل `https://sijil-shawahid.onrender.com`.
5. أضيفي `APP_URL/auth/callback` إلى Redirect URIs في Google Cloud (GOOGLE_SETUP.md، الخطوة 4).
6. افتحي الرابط ← «تسجيل الدخول» ← الإعدادات ← «ربط حساب Google Drive».

## الخيار (ب): Docker على أي خادم VPS (Hetzner / DigitalOcean / خادم المدرسة)
```bash
docker build -t sijil-shawahid .
docker run -d --name sijil --restart unless-stopped -p 3000:3000 \
  -v sijil-data:/data --env-file .env sijil-shawahid
```
ثم ضعي أمامه وكيلًا عكسيًا يمنح HTTPS تلقائيًا، مثل Caddy:
```
shawahid.example.com {
  reverse_proxy 127.0.0.1:3000
}
```

## الخيار (ج): Railway أو Fly.io
- كلاهما يدعم Dockerfile مباشرة.
- أنشئي **Volume** واربطيه على `/data` (القيمة الافتراضية لـ `DATABASE_PATH` داخل الصورة).

## ربط نطاق خاص (اختياري)
1. اشتري نطاقًا، مثل `shawahid-fatimah.com`، أو استخدمي نطاقًا فرعيًا للمدرسة.
2. أضيفيه في لوحة الاستضافة (Custom Domain)، ثم أنشئي سجل DNS بالقيمة التي تعطيك إياها (عادة `CNAME` يشير إلى رابط الاستضافة).
3. حدّثي `APP_URL` إلى النطاق الجديد، وأضيفي النطاق في Google Cloud: Authorized domains، وJavaScript origins، وRedirect URIs.

## قاعدة البيانات والنسخ الاحتياطي
- ملف واحد `shawahid.db`، ومخططه في `db/schema.sql`، ويُنشأ تلقائيًا عند أول تشغيل.
- من الإعدادات ← النسخ الاحتياطي، يمكنك: تنزيل نسخة JSON، أو حفظها في Google Drive داخل المجلد الرئيسي، أو استعادتها.
- لنقل المنصة إلى استضافة أخرى: انقلي ملف `.db` (أو استعيدي نسخة JSON)، واستخدمي `TOKEN_ENCRYPTION_KEY` نفسه، أو أعيدي ربط Drive.

## قيود الاستضافة التي يجب معرفتها
- الرفع يمر عبر الخادم بأجزاء من 8 ميجابايت، لذا تعتمد سرعته على سرعة الاستضافة. لا يوجد حد لحجم الملف من المنصة.
- بعض الوكلاء (مثل Cloudflare المجاني) يحدّ حجم الطلب الواحد بـ 100 ميجابايت، وأجزاؤنا 8 ميجابايت فلا مشكلة.
- `/healthz` نقطة فحص صحة الخدمة، وتُرجع `configured: false` إن كانت متغيرات البيئة ناقصة.
