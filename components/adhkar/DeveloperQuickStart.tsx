'use client'

import { useState } from 'react'
import { Check, Copy } from 'lucide-react'

const examples = {
  html: `<button id="play" disabled>تشغيل الذكر</button>
<p id="dhikr"></p>
<script type="module">
const url = 'https://samee3.vercel.app/api/adhkar/v1/items'
  + '?format=simple&reciter=hamad-al-drehem&category=1&limit=100';
const response = await fetch(url);
if (!response.ok) throw new Error('تعذر تحميل الأذكار');
const { items } = await response.json();
const first = items.find(item => item.audioUrl);
if (!first) throw new Error('لا يوجد تسجيل لهذا الاختيار');
document.querySelector('#dhikr').textContent = first.text;
const audio = new Audio(first.audioUrl);
const button = document.querySelector('#play');
button.disabled = false;
button.onclick = () => audio.play();
console.log(first.startMs, first.endMs, first.repeatCount, first.rightsId);
</script>`,
  sdk: `import { Samee3Adhkar } from
  'https://samee3.vercel.app/adhkar-sdk/v1/index.js';

const api = new Samee3Adhkar();
const { reciters } = await api.readers();
const { items } = await api.items({
  reciter: 'mishary-alafasy', category: 1, section: 'morning'
});
console.log(items[0].text, items[0].audioUrl);
console.log(items[0].startMs, items[0].endMs);

const timings = await api.timings('mishary-alafasy');
const chapter = await api.recordingTimings('mishary-alafasy:104');
// chapter.items: text, startMs, endMs داخل التسجيل الكامل.
// كل العناصر المتاحة، مع الترقيم التلقائي:
for await (const item of api.allItems({ reciter: 'hamad-al-drehem' })) {
  console.log(item.audioUrl);
}`,
  dart: `import 'dart:convert';
import 'package:http/http.dart' as http;

Future<List<dynamic>> loadAdhkar() async {
  final uri = Uri.https('samee3.vercel.app', '/api/adhkar/v1/items', {
    'format': 'simple', 'reciter': 'hamad-al-drehem',
    'category': '1', 'limit': '100',
  });
  final response = await http.get(uri);
  if (response.statusCode != 200) throw Exception('تعذر تحميل الأذكار');
  final data = jsonDecode(utf8.decode(response.bodyBytes));
  return data['items'];
}
// item['audioUrl'] رابط MP3 مباشر.
// item['startMs'] وitem['endMs'] بالمللي ثانية.
// استخدم nextOffset لاستكمال بقية العناصر عند الحاجة.`,
}

export default function DeveloperQuickStart() {
  const [tab, setTab] = useState<keyof typeof examples>('html')
  const [copied, setCopied] = useState(false), [error, setError] = useState('')
  const copy = async () => {
    try { await navigator.clipboard.writeText(examples[tab]); setCopied(true); setError('') }
    catch { setError('يمكنك تحديد الكود ونسخه يدويًا من المربع.') }
  }
  return <section className="rounded-3xl border border-[#dfd4be] bg-white p-5 sm:p-7">
    <p className="text-xs font-bold text-[#a08754]">ابدأ بنسخ الكود</p><h2 className="mt-2 text-xl font-extrabold">استدعاء مجاني، دون حساب أو مفتاح API</h2>
    <p className="mt-3 text-sm leading-8 text-slate-600">الصيغة المبسطة تجمع نص الذكر ورابط MP3 الكامل وتوقيت البداية والنهاية وعدد التكرار في عنصر واحد. أمثلة HTML وSDK تعمل في المتصفح دون تثبيت مكتبات. مثال Flutter يستخدم حزمة http.</p>
    <div className="mt-5 flex flex-wrap items-center justify-between gap-3"><div role="group" aria-label="لغة المثال" className="flex flex-wrap gap-2">{([['html', 'HTML جاهز'], ['sdk', 'JavaScript SDK'], ['dart', 'Flutter / Dart']] as const).map(([key, label]) => <button type="button" key={key} aria-pressed={tab === key} onClick={() => { setTab(key); setCopied(false); setError('') }} className={`min-h-10 rounded-full px-4 text-xs font-bold ${tab === key ? 'bg-[#214e40] text-white' : 'bg-[#f5f0e6] text-[#73613e]'}`}>{label}</button>)}</div>
      <button type="button" onClick={() => void copy()} className="inline-flex min-h-10 items-center gap-2 rounded-xl border px-4 text-xs font-bold">{copied ? <Check size={15}/> : <Copy size={15}/>} {copied ? 'تم النسخ' : 'نسخ الكود'}</button>
    </div>
    <pre dir="ltr" className="mt-4 max-h-[34rem] overflow-auto rounded-2xl bg-[#142c28] p-5 text-left text-xs leading-7 text-[#e6ecd9]"><code>{examples[tab]}</code></pre>
    {error && <p role="status" className="mt-2 text-xs leading-7">{error}</p>}
    <p className="mt-3 text-xs leading-7 text-slate-500">الوصول إلى الواجهة مجاني. احتفظ بنسبة الصوت إلى صاحبه والتزم بشروط rightsId لكل تسجيل؛ ترخيص SDK لا يغيّر تراخيص الصوتيات الأصلية.</p>
    <div className="mt-3 flex flex-wrap gap-4 text-xs font-bold text-emerald-800"><a href="/adhkar-sdk/v1/index.js" download className="underline">تحميل SDK</a><a href="/adhkar-sdk/v1/example.html" className="underline">تجربة مثال كامل</a><a href="/api/adhkar/v1/items?format=simple&reciter=hamad-al-drehem&category=1" className="underline">معاينة JSON المبسّط</a></div>
  </section>
}
