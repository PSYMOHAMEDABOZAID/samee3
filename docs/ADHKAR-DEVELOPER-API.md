# أذكار سميع للمطورين — API v1

بعد رفع الحزمة، تكون صفحة التوثيق متاحة على `/developers/adhkar` دون تسجيل دخول.
الملفات الصوتية الفعلية داخل `public/audio/adhkar/`، وليست روابط تشغيل تعتمد على خدمات خارجية.
مصادر التسجيلات الأصلية محفوظة في بيانات كل مقطع للتوثيق، ولا تنقل ملكية الأصوات إلى سميع.

## المسارات

| المسار | النتيجة |
| --- | --- |
| `/api/adhkar/v1` | الإصدار والقراء والأقسام ووصف الواجهة |
| `/api/adhkar/v1/reciters` | القراء والتغطية الفعلية لكل قارئ |
| `/api/adhkar/v1/items?reciter=hamad-al-drehem&category=1` | نصوص ومقاطع باب معين بصوت القارئ |
| `/api/adhkar/v1/timings/hamad-al-drehem` | توقيتات المقاطع ومواقعها في المصادر الأصلية |
| `/data/adhkar-audio/v1/catalog.json` | الفهرس الكامل كملف JSON ثابت |
| `/data/adhkar-audio/v1/coverage.json` | المقاطع المتاحة والعناصر الناقصة لكل قارئ |
| `/data/adhkar-audio/v1/timings/{reciter}.json` | ملف توقيتات ثابت لقارئ معين |
| `/data/adhkar-audio/v1/openapi.json` | وصف OpenAPI |

الطلبات تدعم CORS للقراءة العامة دون ملفات ارتباط أو مفاتيح خاصة. لا توجد واجهات كتابة.
رابط الصوت في `recordings[reciter].url` مسار نسبي؛ اربطه بعنوان موقع سميع عند الاستخدام من تطبيق خارجي.

## خيارات طلب العناصر

| الخيار | المعنى |
| --- | --- |
| `reciter` | معرّف القارئ المنشور في قائمة القراء |
| `category` | رقم الباب |
| `item` | رقم الذكر داخل الباب |
| `offset` | بداية الصفحة؛ القيمة الافتراضية صفر |
| `limit` | عدد النتائج؛ الافتراضي 50 والأقصى 100 |
| `includeMissing=1` | تضمين عناصر لا تتوفر لها قراءة فردية لهذا القارئ |

النتيجة تعيد `nextOffset`. استخدمه حتى يصبح `null` لجلب كل الصفحات. لا تفترض أن كل قارئ لديه كل العناصر؛ تحقق من وجود `recordings[reciter]`.

## معنى التوقيتات والتحقق

- جميع الأوقات بالمللي ثانية، وليست بالثواني.
- `timing.startMs = 0` و`timing.endMs = durationMs` داخل الملف الفردي.
- `source.startMs` و`source.endMs` يحددان موضع المقطع في التسجيل الأصلي المحدد ببصمة `source.sha256`.
- `sha256` يتحقق من الملف الفردي نفسه؛ `bytes` حجمه الكامل، و`durationMs` مدته المقاسة بأداة ffprobe.
- `publisher-individual-file`: ملف نشره المصدر أصلًا لكل ذكر.
- `publisher-single-item-chapter`: ملف باب مصدره لا يحتوي في فهرس سميع إلا ذكرًا واحدًا؛ أُبقي الملف كاملًا، وقد يتضمن اسم الباب أو مرجعه.
- `audio-word-alignment`: مقطع فُصل من التسجيل نفسه بعد مطابقة آلية للكلام. `textMatchScore` درجة مطابقة النص، وليست احتمالًا إحصائيًا لصحة التسجيل. قد تكون المقارنة على الكلمات أو الحروف العربية لتجاوز اختلاف الفصل الإملائي بين الكلمات.
- `textMatchScope=quoted-invocation` يعني أن المطابقة اقتصرت على الدعاء المحاط بعلامتي الأقواس في النص الأصلي؛ التعليمات التحريرية مثل وقت قوله أو عدد تكراره ليست جزءًا من التسجيل المطابق. يبقى نص بطاقة الذكر كاملًا دون تعديل.
- `manuallyReviewed=false` يعني أن الحزمة لا تدّعي استماعًا بشريًا شاملًا لكل مقطع. لا تصف المقاطع الآلية للمستخدمين بأنها مراجعة بشرية أو مضبوطة 100%.
- تقرير التغطية يحدد غير المتاح في هذه الحزمة؛ لا يثبت أن القارئ لم يسجل هذه الأذكار في مكان آخر.

لا تُقسَّم التوقيتات بتوزيع مدة الملف على عدد الأذكار، ولا تُنسخ توقيتات قارئ إلى قارئ آخر. المقاطع التي لم تحقق شروط المطابقة لم تُضف باعتبارها تسجيلات فردية متاحة.

## JavaScript

```js
const base = 'https://samee3.vercel.app';
const reader = 'hamad-al-drehem';
const response = await fetch(`${base}/api/adhkar/v1/items?reciter=${reader}&category=1`);
if (!response.ok) throw new Error('تعذر جلب الأذكار');
const { items } = await response.json();
const first = items.find(item => item.recordings[reader]);

// عرّف audio وbutton في الواجهة، ثم ابدأ التشغيل من ضغطة المستخدم.
button.onclick = () => {
  audio.src = new URL(first.recordings[reader].url, base).href;
  audio.play().catch(() => { /* اعرض زر إعادة المحاولة */ });
};
```

استخدم `repeatCount` إذا أردت التكرار، وتأكد من ألا تُكرر ملف باب كامل باعتباره تسجيلًا فرديًا لذكر واحد.

## Flutter

```dart
final base = Uri.parse('https://samee3.vercel.app');
// بعد قراءة JSON من /api/adhkar/v1/items:
final recording = item['recordings']['hamad-al-drehem'];
final audioUri = base.resolve(recording['url'] as String);
final start = Duration(milliseconds: recording['timing']['startMs'] as int);
final end = Duration(milliseconds: recording['timing']['endMs'] as int);
// مرر audioUri وstart وend إلى المشغل المستخدم في مشروعك.
```

## Android / Kotlin

```kotlin
val base = java.net.URI("https://samee3.vercel.app")
val recording = item.getJSONObject("recordings").getJSONObject("hamad-al-drehem")
val audioUrl = base.resolve(recording.getString("url")).toString()
val durationMs = recording.getLong("durationMs")
// جهز MediaPlayer أو مشغل التطبيق بالرابط، ثم ابدأ من زر المستخدم.
```

## iOS / Swift

```swift
let base = URL(string: "https://samee3.vercel.app")!
let url = URL(string: recording.url, relativeTo: base)!.absoluteURL
let playerItem = AVPlayerItem(url: url)
let player = AVPlayer(playerItem: playerItem)
// احتفظ بالمشغل في حالة التطبيق، وشغله من زر المستخدم.
```

## تحميل الملفات للمطورين

باستخدام Python 3، دون مكتبات إضافية:

```bash
python3 scripts/download-adhkar-api.py --reciter hamad-al-drehem --output samee3-adhkar
```

السكربت يجلب الفهرس الكامل، ويحفظ الملفات، ويتحقق من الحجم والبصمة، ويتخطى الملفات السليمة التي نُزّلت من قبل.
جرّبه بعد رفع الملفات ونشر التحديث؛ المسارات الجديدة لا تكون متاحة على الموقع المنشور قبل ذلك.

## التحقق المحلي

```bash
npm run test:adhkar-api
python3 scripts/validate-adhkar-assets.py --decode
```

الخيار `--decode` يتطلب ffmpeg. تشغيل الموقع على Vercel لا يحتاج ffmpeg ولا نموذج تعرف صوتي؛ التجهيز تم مسبقًا.

## شروط المصادر

الواجهة والفهرسة متاحان للمطورين مجانًا. الصوتيات تبقى خاضعة لشروط مصادرها، كما هو موضح في `ADHKAR-SOURCES-AND-RIGHTS.md` وفي `rights` داخل الفهرس. احتفظ باسم القارئ ورابط المصدر، ولا تصف كل الصوتيات بأنها ملكية عامة أو مسجلة حصريًا لسميع.

## توسعة القراء وصيغ الصباح والمساء

الإصدار `2026-11-05.2` يبقي واجهة `v1` ويضيف القراء الموجودين سابقًا في سميع وقراء إضافيين، مع الاحتفاظ بملفات الإصدار السابق الـ626 كما هي.

- `/api/adhkar/v1/sections` يعيد التسجيلات الكاملة وأبواب المصادر، ويقبل `reciter` و`category` و`type`.
- `/adhkar/recordings` صفحة للاستماع والتنزيل داخل التطبيق.
- `section=morning` أو `section=evening` في واجهة العناصر يختار الصيغة الصحيحة. لا يعاد ملف محدد للصباح باعتباره تسجيلًا مسائيًا إذا لم تتوفر صيغة المساء.
- يحتفظ `variants[reciter].morning` و`variants[reciter].evening` بالصيغ المتاحة. قد تكون صيغة واحدة هي الافتراضية أيضًا، فلا تحسبها ملفًا ثانيًا.
- `recordingCount` هو عدد ارتباطات الذكر والقارئ الافتراضية، و`individualAudioFileCount` عدد الملفات الفردية الفريدة مع الصيغ، و`sectionRecordingCount` عدد التسجيلات الكاملة، و`totalAudioFileCount` مجموع الملفات الفريدة المشحونة.
- `canonical-morning-invocation` و`canonical-evening-instruction` يوضحان أن الصيغة مأخوذة من النص أو تعليمات المساء الموجودة أصلًا فيه. `matchedText` هو النص الذي جرت مطابقته دون استبدال نص البطاقة الأصلي.
- `quoted-quran-passage` يطابق الآية المقتبسة؛ قد لا يتضمن الاستعاذة المكتوبة قبلها. و`publisher-complete-recording` يعني ملف المصدر الكامل.
- ملفات توقيتات القارئ تتضمن `items` و`variants` و`sections`، وجميع الأوقات بالمللي ثانية. تحمل المقاطع المحددة لصيغة معينة `contextSection`، وتربط `rightsId` الملف بشروط مصدره.

يتطلب سكربت التنزيل Python 3.9 أو أحدث، دون مكتبات إضافية. يجلب الفهرس الثابت الكامل ثم يتحقق من حجم وبصمة كل ملف:

```bash
python3 scripts/download-adhkar-api.py --all --output samee3-all-adhkar
python3 scripts/download-adhkar-api.py --reciter mishary-alafasy --include-variants --include-sections
```

تربط `rightsId` كل ملف بمجموعة داخل `rights.profiles`. شروط TVQuran تقصر الاستخدام على غير التجاري، ولا تنقل هذه الحزمة ترخيصًا تجاريًا عامًا لملفات الأرشيف أو لحقوق الأداء والإنتاج. الواجهة والفهرسة متاحتان دون حساب أو مفتاح API بعد نشر التحديث.

## توسعة البيانات الثالثة

يضم إصدار `2026-11-06.3` القراء السابقين مع 14 اسمًا إضافيًا. استخدم قائمة `/reciters` والأعداد المنشورة بدل افتراض عدد ثابت أو اكتمال التسجيلات لكل قارئ. من أمثلة المعرّفات الجديدة `wadie-alyamani` و`ahmad-alnufais` و`muhammad-dibirov`.

يمكن أن يحمل المقطع `quoted-quran-passages` عندما يضم جميع الآيات المقتبسة في البطاقة. يعرض `matchedText` النص الذي طابق التسجيل دون استبدال النص الكامل في `text`. كل مقطع جديد يحتفظ ببصمة تسجيله الأصلي وإزاحة القص منه؛ المحاذاة الآلية لا تعني مراجعة استماع بشرية شاملة.

خيارات تكرار الاستماع في تطبيق سميع لا تغيّر `repeatCount` الأصلي في الواجهة. ليطبّق المطور تكرارًا اختياريًا مستقلًا، ويتحقق من التغطية والصيغة والحقوق قبل الاستخدام.
