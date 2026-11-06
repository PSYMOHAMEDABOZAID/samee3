# استدعاء أذكار سميع مجانًا

عنوان الخدمة: `https://samee3.vercel.app`. لا تحتاج إنشاء حساب، ولا مفتاح API. طلبات JSON والصوتيات وSDK تسمح بالاستدعاء من نطاقات أخرى. الخدمة متاحة للمطورين مباشرة؛ لا يلزم عرض رابطها في قائمة الأذكار للمستخدمين.

## طلب واحد للنص والصوت والتوقيتات

```javascript
const response = await fetch(
  'https://samee3.vercel.app/api/adhkar/v1/items' +
  '?format=simple&reciter=hamad-al-drehem&category=1&limit=100'
);
if (!response.ok) throw new Error('تعذر تحميل الأذكار');
const data = await response.json();
console.log(data.items[0]);
```

كل عنصر يتضمن:

| الحقل | المعنى |
| --- | --- |
| `id` | معرّف ثابت مثل `1:1` |
| `text` | نص الذكر دون تغيير الفهرس الأصلي |
| `repeatCount` | عدد التكرار الوارد في البيانات |
| `audioUrl` | رابط MP3 كامل لهذا القارئ؛ لا يتم استبدال صوته بقارئ آخر |
| `startMs` و`endMs` | البداية والنهاية داخل الملف المستقل بالمللي ثانية |
| `sourceTiming` | موضع المقطع في التسجيل الأصلي |
| `rightsId` و`sourcePage` | شروط المصدر ونسبة التسجيل |
| `alignment` | طريقة المحاذاة وحالة المراجعة ودرجة المطابقة المتاحة |

الملف المستقل يبدأ عند الصفر، و`endMs` هي مدته. `sourceTiming` يتعلق بالتسجيل الأصلي، ولا يُستخدم كموضع بدء داخل الملف المنفصل. مع `includeMissing=1` يكون `audioUrl` وحقول التوقيت `null` حين لا يوجد مقطع، بدل اختلاق رابط أو اختيار صوت آخر.

## اختيار القارئ والباب

- القراء: `/api/adhkar/v1/reciters`، ومفتاح القائمة `reciters`.
- فهرس الأبواب والنصوص والتغطية: `/api/adhkar/v1`.
- اختر القارئ بواسطة `reciter` والباب بواسطة `category`، والذكر بواسطة `item` عند الحاجة.
- لصيغ الصباح أو المساء في الباب الأول استخدم `category=1&section=morning` أو `category=1&section=evening`. `section` يحدد الصيغة الصوتية؛ اختيار الباب يبقى بواسطة `category`.
- الترقيم: `limit` من 1 إلى 100، و`offset` من صفر. استمر باستخدام `nextOffset` حتى يكون `null`.
- حذف `format=simple` يعيد شكل v1 الأصلي، بما فيه خريطة `recordings` و`variants`، لتظل التكاملات السابقة تعمل.

## SDK JavaScript دون تثبيت

```javascript
import { Samee3Adhkar } from
  'https://samee3.vercel.app/adhkar-sdk/v1/index.js';

const api = new Samee3Adhkar();
const { items } = await api.items({
  reciter: 'mishary-alafasy', category: 1, section: 'morning'
});
const timingFile = await api.timings('mishary-alafasy');
const { recordings } = await api.recordings({ reciter: 'mishary-alafasy' });
const chapters = await api.recordingTimings(recordings[0].id);

for await (const item of api.allItems({ reciter: 'hamad-al-drehem' })) {
  console.log(item.audioUrl, item.startMs, item.endMs);
}
```

إذا استضفت الخدمة نفسها على نطاق آخر، اضبط متغير الخادم `SAMEE3_PUBLIC_ORIGIN` على نطاقك العام، ثم استخدم `new Samee3Adhkar({ baseUrl: 'https://your-site.example' })`. يبقى الوضع الافتراضي متصلًا بخدمة سميع حتى عند نسخ SDK إلى تطبيق آخر. تدعم الاستدعاءات `{ signal }` لإلغاء التحميل. مثال: `api.items({ reciter: 'hamad-al-drehem' }, { signal: controller.signal })`.

للتشغيل على الآيفون جهّز رابط الصوت أولًا، ثم استدعِ `audio.play()` داخل ضغطة المستخدم مباشرة. فتح الصفحة أو اكتمال طلب الشبكة لا يمنح تلقائيًا إذن التشغيل.

## التوقيتات داخل التسجيل الكامل

```javascript
const response = await fetch(
  'https://samee3.vercel.app/api/adhkar/v1/sections/mishary-alafasy%3A104/timings'
);
const { recording, items } = await response.json();
// recording.url: الملف الكامل، ويُحل إلى النطاق عند استخدامه مباشرة.
// items: النصوص وstartMs وendMs داخل هذا التسجيل الكامل.
```

الواجهة تطابق بصمة الملف الأصلي ورابطه وهوية القارئ. لا تستخدم توقيتات تسجيل آخر. تعرض المقاطع المنشورة فقط؛ الفجوات والأجزاء غير المطابقة لا تحمل نصًا مُخمّنًا. توجد توقيتات منشورة في 99 من 122 تسجيلًا كاملًا في مجموعة البيانات الحالية؛ التغطية داخل التسجيل قد تكون جزئية. بعض المقاطع محاذاة آلية، ولم تُجر مراجعة بشرية شاملة لها.

## الأكواد والحقوق

الكود الجديد لـSDK والأمثلة متاح بترخيص MIT داخل `public/adhkar-sdk/v1/LICENSE.txt`. الوصول إلى الواجهة مجاني. تبقى الصوتيات خاضعة لشروط مصادرها ونسبتها إلى أصحابها؛ ملفات TVQuran تحمل قيد الاستخدام غير التجاري، ولا يمنح وجود ملف في الأرشيف ترخيصًا تجاريًا. تُعاد `rights` و`rightsId` في البيانات لتسهيل معرفة الشروط لكل ملف.

المصادر: [شروط IslamHouse](https://d1.islamhouse.com/html/faq.htm)، [شروط TVQuran](https://www.tvquran.com/ar/page/1)، [مصدر فهرس النصوص](https://github.com/rn0x/Adhkar-json).

## روابط جاهزة

- [الدليل والأمثلة](https://samee3.vercel.app/developers/adhkar)
- [مثال HTML يعمل مباشرة](https://samee3.vercel.app/adhkar-sdk/v1/example.html)
- [SDK](https://samee3.vercel.app/adhkar-sdk/v1/index.js)
- [وصف OpenAPI](https://samee3.vercel.app/data/adhkar-audio/v1/openapi.json)
