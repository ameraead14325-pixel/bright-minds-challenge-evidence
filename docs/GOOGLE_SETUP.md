# إعداد Google Cloud وOAuth 2.0

هذه الخطوات **تحتاج إلى تنفيذك أنتِ** لأنها تتم بحسابك في Google، وتستغرق قرابة 15 دقيقة. احتاجي قبل البدء إلى الرابط العام للمنصة (راجعي DEPLOY.md)، ويمكنك البدء بـ `http://localhost:3000` للتجربة المحلية.

## 1) إنشاء مشروع
1. افتحي https://console.cloud.google.com وسجّلي الدخول بحساب Google الذي يحوي الشواهد.
2. من القائمة العلوية اختاري **Select a project ← New Project**، وسمّيه مثلًا `sijil-shawahid`، ثم **Create**.

## 2) تفعيل Google Drive API
**APIs & Services ← Library** ← ابحثي عن **Google Drive API** ← **Enable**.

## 3) شاشة الموافقة (OAuth consent screen / Google Auth Platform)
1. **APIs & Services ← OAuth consent screen** (قد تظهر باسم *Google Auth Platform ← Branding*).
2. نوع المستخدمين:
   - مع حساب Gmail شخصي: اختاري **External**.
   - مع حساب Google Workspace تابع للمدرسة أو الإدارة: اختاري **Internal** إن كان متاحًا، فلا تظهر عندها أي تحذيرات.
3. اسم التطبيق: `سجل شواهد الأداء الوظيفي`، وبريد الدعم: بريدك.
4. **Authorized domains**: نطاق المنصة بدون https (مثل `onrender.com` أو نطاقك الخاص).
5. **Data access / Scopes** ← Add: `openid`، و`.../auth/userinfo.email`، و`.../auth/userinfo.profile`، و`https://www.googleapis.com/auth/drive`.
6. **Audience / Test users**: أضيفي بريدك وبريد مديرة المدرسة.

### ⚠️ مهم جدًا: حالة النشر (Publishing status)
- في وضع **Testing** تنتهي صلاحية الربط مع Drive **كل 7 أيام** (هذا قيد من Google)، وستطلب المنصة إعادة الربط.
- للاستخدام الدائم اضغطي **Publish app** ليصبح التطبيق **In production**.
- التطبيق غير الموثّق من Google يُظهر عند الدخول شاشة *Google hasn't verified this app*. اضغطي **Advanced ← Go to … (unsafe)**؛ فهو تطبيقك الخاص. يسمح Google بهذا لعدد محدود من المستخدمين (حتى 100)، وهو كافٍ للمعلمة والإدارة.
- توثيق Google الرسمي لنطاق `drive` يتطلب مراجعة أمنية مدفوعة، **ولا حاجة له** في الاستخدام الشخصي أو المدرسي المحدود.

### لماذا نطاق `drive` الكامل؟
لكي تقرأ المنصة مجلدات الشواهد **الموجودة مسبقًا** في حسابك وتعرضها وترفع إليها، يلزم نطاق `drive`. النطاق الأضيق `drive.file` لا يصل إلا إلى الملفات التي أنشأها التطبيق بنفسه، فلن تظهر ملفاتك الحالية. والمنصة رغم ذلك **تقيّد نفسها برمجيًا**: لا تعرض ولا تفتح أي ملف خارج المجلدات المرتبطة بالأقسام (هذا الشرط مختبر آليًا).

## 4) إنشاء بيانات الاعتماد (OAuth Client)
1. **APIs & Services ← Credentials ← Create credentials ← OAuth client ID**.
2. Application type: **Web application**.
3. **Authorized JavaScript origins**: الرابط العام، مثل `https://shawahid.example.com`.
4. **Authorized redirect URIs**: الرابط العام مضافًا إليه `/auth/callback` حرفيًا:
   - `https://shawahid.example.com/auth/callback`
   - (وللتجربة المحلية) `http://localhost:3000/auth/callback`
5. اضغطي **Create** وانسخي **Client ID** و**Client Secret**.

## 5) متغيرات البيئة في الخادم
```
APP_URL=https://shawahid.example.com        ← يطابق الأصل المسجّل تمامًا
GOOGLE_CLIENT_ID=xxxxxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxx         ← في الخادم فقط، لا يُوضع في أي ملف واجهة
OWNER_EMAIL=بريدك@gmail.com
VIEWER_EMAILS=بريد-المديرة@gmail.com          ← اختياري
TOKEN_ENCRYPTION_KEY=(ناتج npm run gen-key)
```
> احتفظي بنسخة آمنة من `TOKEN_ENCRYPTION_KEY`: إذا تغيّر، فستحتاجين فقط إلى إعادة ربط Drive، ولن تتأثر ملفاتك ولا إعداداتك.

## أخطاء شائعة
| الرسالة | الحل |
|---|---|
| `redirect_uri_mismatch` | يجب أن يطابق Redirect URI قيمة `APP_URL` + `/auth/callback` حرفيًا، بما في ذلك https وعدم وجود `/` زائدة |
| `access_denied` / «لم تتم الموافقة على صلاحية Drive» | أضيفي بريدك إلى Test users، ووافقي على مربع Drive في شاشة الموافقة |
| انتهاء الربط أسبوعيًا | التطبيق ما زال في وضع Testing، فاضغطي Publish app |
| «الحساب غير مصرّح له» | البريد ليس `OWNER_EMAIL` ولم يُضف في المطّلعين |
