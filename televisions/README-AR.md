# مصحف سميع لشاشات العرض

| النظام | الملفات/التشغيل | الإشعارات |
| --- | --- | --- |
| Android TV وGoogle TV وFire TV القائم على Android 8/API 26 أو أحدث | مشروع `televisions/android`؛ يعتمد على ملفات `native` الموجودة في المستودع ويعرض الموقع بعرض الكمبيوتر، مع المصحف المحلي الاحتياطي | مجدول أندرويد والأذان الموجودان في النسخة الأصلية، حسب صلاحيات النظام |
| LG webOS | مشروع `televisions/webos` وحزمة `televisions/installers/SAMEE3-webOS.ipk` | تذكيرات داخل الشاشة أثناء فتح سميع؛ Push في الخلفية يعتمد على دعم المتصفح |
| Samsung Tizen | مشروع `televisions/tizen` للاختبار والتوقيع بشهادة الجهاز، أو فتح `https://samee3.vercel.app/?tv=1` من المتصفح | تذكيرات أثناء فتح سميع؛ لا ندعي دعم إشعار نظام وهو مقفول |
| شاشة بمتصفح قديم لا يدعم Next.js الحالي | عرض سميع من كمبيوتر عبر HDMI، أو جهاز بث حديث بمحرك متصفح مدعوم | حسب الجهاز المصدر |

واجهة سميع وأقسامه تبقى هي نفسها. وضع الشاشة يضيف إطار تركيز واضحًا وتنقلًا بالأسهم. في نسخة أندرويد يفتح زر Menu قائمة الرئيسية والمواقيت والإشعارات والمصحف المحفوظ والخروج، ويعمل زر الرجوع داخل التصفح. تغيير أكواد الموقع يظهر دون إعادة بناء APK؛ تغيير أكواد أندرويد أو الصلاحيات يحتاج APK جديدًا.

## بناء Android TV على GitHub

بعد دمج الحزمة، يعمل **Build SAMEE3 TV** عند تغيير ملفات الشاشات أو native، ويبني نسخة Debug للاختبار وRelease. الملفات تظهر في Artifacts. إصدار Debug للاختبار؛ لا تنشره كتحديث رسمي للمستخدمين.

للنشر الرسمي، أنشئ مفتاح توقيع خاصًا بك مرة واحدة واحتفظ به خارج GitHub:

```bash
keytool -genkeypair -keystore samee3-tv.jks -alias samee3-tv -keyalg RSA -keysize 3072 -validity 10000
```

أضف هذه الأسرار في المستودع ← Settings ← Secrets and variables ← Actions:

- `SAMEE3_TV_KEYSTORE_BASE64`: ترميز ملف التوقيع Base64.
- `SAMEE3_TV_STORE_PASSWORD`.
- `SAMEE3_TV_KEY_ALIAS`.
- `SAMEE3_TV_KEY_PASSWORD`.

ثم Actions ← Build SAMEE3 TV ← Run workflow ← فعّل `publish`. ينشر `SAMEE3-TV.apk` في الإصدار `samee3-tv`. يظهر زر التحميل في صفحة التحميلات بعد التحقق من وجود الملف. حافظ على مفتاح التوقيع نفسه للتحديثات، وزد `versionCode` في كل إصدار أندرويد جديد.

ملفات Java المشتركة تضم إصلاح فتح الشاشة المناسبة من الإشعار، ومنع تعارض موفر مشاركة الملفات مع تطبيق الهاتف، وتصدير ZIP بأجزاء صغيرة دون Blob كامل. نسخة الهاتف القديمة التي لا تحتوي جسر حفظ ZIP الجديد تُظهر طلب تحديث APK أو استخدام Chrome للتنزيل.

## LG webOS

ملف IPK الموجود مبني باستخدام CLI الرسمي. لتثبيته على جهاز اختبار، فعّل Developer Mode ووصل أداة webOS بالشاشة ثم استخدم `ares-install`. يحتاج التوزيع العام مسار نشر LG وموافقته، ولا تكفي إعادة تسمية APK إلى IPK.

البناء من المصدر:

```bash
npm install --global @webos-tools/cli
ares-package televisions/webos --outdir tv-output
```

عملية GitHub تبني IPK أيضًا، وتنشره باسم `SAMEE3-webOS.ipk` عند اختيار النشر، فيظهر رابط LG في التحميلات.

## Samsung Tizen

افتح `televisions/tizen` في Tizen Studio مع TV Extensions، وأنشئ شهادة Samsung تشمل جهاز الاختبار ثم ابنِ WGT. مشروعنا مشغل مستضاف للموقع؛ Samsung تشترط موافقة/صلاحية شريك لقبول تطبيق مستضاف في المتجر، ولا نتيح WGT غير موقع أو ندعي أنه جاهز للنشر العام. المتصفح يظل مسار تشغيل مباشرًا على الأجهزة القادرة.

## التوافق والتحقق

حزمة Android مستقلة بمعرّف `app.samee3.quran.tv` كي لا تستبدل نسخة الهاتف. لا تحتوي مكتبات native مرتبطة بمعالج محدد، لكن تشغيل كل خصائص الموقع يحتاج WebView حديثًا. دعم النظام القديم وحده لا يضمن دعم JavaScript أو PDF أو YouTube أو Web Push.

تم فحص ملفات الإعداد ومصادر Java، وبُني IPK. اختبار الريموت والصوت والأذان وقيود البطارية والإشعارات على موديل فعلي ما زال مطلوبًا قبل نشر نسخة متجر. لا تتضمن هذه الحزمة APK Release موقعًا بمفتاح ناشر لم تزودنا به.

مراجع الشركات: https://webostv.developer.lge.com/develop/getting-started/web-app-types و https://developer.samsung.com/smarttv/develop/faq/hosted-applications.html .
