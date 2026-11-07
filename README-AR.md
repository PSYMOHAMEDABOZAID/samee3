# مصحف سميع — توافق المتصفحات القديمة — 7 نوفمبر 2026

## الهدف

النسخة الحديثة تظل كما هي. يضاف مسار ثابت بسيط للقراءة والصوت والتحميل يعمل مع JavaScript معطل أو عندما لا يستطيع المتصفح تشغيل React / Next.js.

## التركيب (لا يحتاج GitHub Actions)

1. فك ضغط الملف على الهاتف أو الكمبيوتر. **لا ترفع ملف ZIP ذاته إلى GitHub باعتباره ملفات موقع**؛ ارفع الملفات التي بداخله بمساراتها كما هي من `Upload files` أو انسخ المجلدات إلى نسخة المستودع المحلية ثم ارفع التغييرات.
2. استبدل الملفات الموجودة التي تحمل نفس المسار. لا تحذف ملفات أخرى من المشروع.
3. بعد نشر Vercel، افتح `/legacy/index.html` في الموقع الأساسي واختبر الروابط المذكورة أدناه.

## المسارات

- `app/layout.tsx`: فحص خفيف قبل React يحول المتصفحات التي تفتقد APIs أساسية أو بنية JavaScript حديثة إلى HTML الخفيف؛ مع رابط fallback لو JavaScript معطل.
- `app/downloads/page.tsx`: روابط تنزيل HTML ثابتة تظهر حتى عندما يتعطل ترطيب واجهة React.
- `components/TelevisionDownloads.tsx`: زر تنزيل التلفاز دائم الظهور وليس مشروطًا بنتيجة fetch.
- `app/api/legacy-download/route.ts`: روابط تنزيل عبر HTTP 302 إلى الملفات المنشورة فقط، ورسالة عربية إذا لم يكن الملف موجودًا.
- `app/api/legacy-quran/route.ts`: قراءة صفحات 1–604 بالروايات الـ7 من API سميع الحالي دون نسخ أو تعديل نص القرآن، مع تشغيل MP3 لسورة الصفحة برواية حفص.
- `app/api/legacy-audio/route.ts`: مشغل HTML/MP3 بالاستماع إلى السور الـ114 من مصدر العفاسي في mp3quran.
- `public/legacy/index.html`: صفحة البداية الخفيفة بلا React أو JavaScript.
- `public/legacy/audio/index.html`: فهرس 114 سورة بلا JavaScript.
- `next.config.js`: إضافة مسار قارئ HTML إلى outputFileTracingIncludes حتى ينشر معه بيانات المصحف المستخدمة في المصدر الحالي.
- `scripts/test-legacy-compat.cjs`: فحوص ثابتة للملفات وروابط HTML والتوجيه.
- `scripts/test-legacy-routes.cjs`: اختبارات سلوك محاكاة (mock) لمسارات المصحف والصوت والتنزيل، لا تتصل بخوادم خارجية.

## الاختبار بعد النشر

- https://samee3.vercel.app/legacy/index.html
- https://samee3.vercel.app/api/legacy-quran?page=1&riwaya=hafs
- https://samee3.vercel.app/legacy/audio/index.html
- https://samee3.vercel.app/api/legacy-audio?surah=1
- https://samee3.vercel.app/api/legacy-download?kind=tv
- https://samee3.vercel.app/downloads

## حدود مهمة

- **ليس صحيحًا أن كل نظام قديم قادر على كل وظائف الموقع**: HTML البسيط يساعد في القراءة والتحميل. تشغيل MP3 يتطلب دعم الصوت وTLS من المتصفح، والاتصال بالخادم الخارجي. فيديوهات الويب، Firebase، الإشعارات، وخزن PWA خارج نطاق دعم بعض الأنظمة القديمة.
- لا يُمكن تغيير الحد الأدنى لإصدار Android المدعوم داخل APK فقط بتعديل الموقع؛ يتطلب ذلك تعديل وإعادة بناء نسخة أصلية متوافقة.
- متصفحات الشاشات القديمة قد تمنع تنزيل APK أو لا تتعامل مع GitHub. عندها ينزل المستخدم الملف من هاتف أو كمبيوتر وينقله USB.
- الإصدار المعتمد في `/api/legacy-download` موجود أو لا وفق ملف GitHub Release الفعلي. لا يتم اختلاق ملف تثبيت.
- عند تحديث الكود الحالي لاحقًا، ادمج تعديلات `app/layout.tsx` و`next.config.js` بعناية إذا كنت قد غيرتهما منذ إنشاء هذا التحديث، ولا تستبدلهما عشوائيًا بملفات أقدم.

## فحص محلي

`node scripts/test-legacy-compat.cjs`

`node scripts/test-legacy-routes.cjs`

الفحص الثابت وحده لا يثبت نجاح نشر Vercel أو تشغيل أجهزة فعلية؛ بعد الرفع يُجرى اختبار `npm run build` على المستودع الأصلي واختبار يدوي بجهاز قديم.
