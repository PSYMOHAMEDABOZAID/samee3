import Link from 'next/link'
import { adhkarAudioCatalog } from '@/lib/adhkar-developer-api'

export const metadata = { title: 'للمطورين | مكتبة أذكار سميع' }

export default function AdhkarDevelopersPage() {
  const data = adhkarAudioCatalog
  const example = `const base = 'https://samee3.vercel.app';
const reader = 'mishary-alafasy';
const result = await fetch(base + '/api/adhkar/v1/items?reciter=' + reader + '&category=1&section=morning');
const { items } = await result.json();
const recording = items[0].recordings[reader];

// Load the list first, then start playback inside the user's click.
button.onclick = () => {
  audio.src = new URL(recording.url, base).href;
  audio.play().catch(console.error);
};`
  return <main dir="rtl" className="min-h-screen bg-[#f7f5f0] px-4 pb-32 pt-6 text-[#213d3f]"><div className="mx-auto max-w-5xl space-y-6">
    <Link href="/adhkar" className="text-sm font-bold text-[#194f43]">→ العودة إلى الأذكار</Link>
    <header className="rounded-3xl bg-[#194f43] p-7 text-white"><p className="text-sm text-[#e5cfaa]">مصحف سميع • Developer API</p><h1 className="mt-2 text-2xl font-extrabold">مكتبة الأذكار للمطورين</h1><p className="mt-3 text-sm leading-8">نصوص الأذكار، ملفات صوتية مستقلة، وتوقيتات بالمللي ثانية. وصول مباشر دون حساب أو مفتاح API، مع حفظ نسبة التسجيلات إلى أصحابها ومصادرها.</p><div className="mt-4 flex flex-wrap gap-3 text-xs"><span>{data.itemCount} ذكرًا</span><span>{data.categoryCount} بابًا</span><span>{data.reciters.length} قارئًا</span><span>{data.individualAudioFileCount} ملفًا فرديًا</span><span>{data.sectionRecordingCount} تسجيلًا كاملًا</span><span dir="ltr">v1 • {data.datasetVersion}</span></div></header>
    <section className="rounded-3xl border border-[#dfd4be] bg-white p-5"><h2 className="font-bold">القراء والتغطية</h2><p className="mt-2 text-sm leading-7 text-slate-600">يعرض الجدول المقاطع الفردية المتاحة في هذه النسخة. التغطية الجزئية لا تعني أن كل الأذكار منشورة بصوت القارئ.</p><div className="mt-4 overflow-x-auto"><table className="w-full text-right text-sm"><thead><tr className="border-b"><th className="p-3">القارئ</th><th className="p-3">ملفات الأذكار</th><th className="p-3">التسجيلات الكاملة</th><th className="p-3">التغطية</th><th className="p-3">المصدر</th></tr></thead><tbody>{data.reciters.map(reader => <tr key={reader.id} className="border-b last:border-0"><td className="p-3 font-bold">{reader.name}<code dir="ltr" className="mt-1 block text-xs font-normal text-slate-500">{reader.id}</code></td><td className="p-3">{reader.individualAudioCount} / {reader.totalCanonicalItems}</td><td className="p-3">{reader.sectionAudioCount}</td><td className="p-3">{reader.coverage === 'complete' ? 'جميع أذكار الفهرس الحالي' : 'جزئية'}</td><td className="p-3"><a href={reader.sourcePage} target="_blank" rel="noreferrer" className="text-emerald-800 underline">صفحة التسجيلات</a></td></tr>)}</tbody></table></div></section>
    <section className="rounded-3xl border border-[#dfd4be] bg-white p-5"><h2 className="font-bold">روابط البيانات</h2><ul className="mt-4 space-y-3 text-sm">{[
      ['/api/adhkar/v1', 'الفهرس ووصف الواجهة'], ['/api/adhkar/v1/reciters', 'القراء والتغطية'],
      ['/api/adhkar/v1/items?reciter=mishary-alafasy&category=1&section=morning', 'مثال: أذكار الصباح بصوت العفاسي'], ['/api/adhkar/v1/sections', 'التسجيلات الكاملة والأبواب الأصلية'], ['/adhkar/recordings', 'استماع وتنزيل التسجيلات الكاملة'],
      ['/data/adhkar-audio/v1/catalog.json', 'ملف JSON الكامل'], ['/data/adhkar-audio/v1/coverage.json', 'تقرير المتاح والناقص'],
      ['/data/adhkar-audio/v1/openapi.json', 'وصف OpenAPI'],
    ].map(([href, text]) => <li key={href}><a href={href} className="text-emerald-800 underline">{text}</a><code dir="ltr" className="mt-1 block overflow-x-auto text-xs text-slate-500">{href}</code></li>)}</ul></section>
    <section className="rounded-3xl border border-[#dfd4be] bg-white p-5"><h2 className="font-bold">ملفات التوقيتات</h2><p className="mt-2 text-sm leading-8">لكل ملف مستقل startMs يساوي صفرًا وendMs يساوي مدته المقاسة. يحتفظ source بموضعه في التسجيل الأصلي وبصمته. المقاطع المفصولة آليًا تحمل وصف طريقة المحاذاة ودرجة المطابقة؛ لا تُعرض باعتبارها مراجعة بشرية شاملة.</p><ul className="mt-3 space-y-2 text-sm">{data.reciters.map(reader => <li key={reader.id}><a href={`/api/adhkar/v1/timings/${reader.id}`} className="text-emerald-800 underline">توقيتات {reader.name}</a></li>)}</ul></section>
    <section className="rounded-3xl border border-[#dfd4be] bg-white p-5"><h2 className="font-bold">مثال JavaScript</h2><pre dir="ltr" className="mt-4 overflow-x-auto rounded-2xl bg-slate-950 p-4 text-left text-xs leading-7 text-slate-100"><code>{example}</code></pre><p className="mt-3 text-xs leading-7 text-slate-600">يُرسل offset وlimit للترقيم، ويمكن تحديد category وitem وreciter وsection لاختيار صيغة الصباح أو المساء، وتحتفظ variants بالصيغ المتاحة. يعرض includeMissing=1 العناصر التي لم يتوفر لها مقطع للقارئ المختار.</p></section>
    <section className="rounded-3xl border border-[#dfd4be] bg-white p-5"><h2 className="font-bold">المصدر وشروط الاستخدام</h2><p className="mt-2 text-sm leading-8">الواجهة متاحة مجانًا. التسجيلات من مصادرها الأصلية وتبقى خاضعة لشروطها، مع نسبة المادة إلى القارئ والناشر وعدم تغيير المحتوى العلمي. ملفات TVQuran للاستخدام غير التجاري وفق شروطه، ولا تمنح حزمة الأرشيف ترخيصًا تجاريًا عامًا. راجع rightsId لكل ملف؛ إتاحة التحميل لا تجعل التسجيلات ملكية عامة.</p><div className="mt-3 flex flex-wrap gap-4 text-sm"><a href="https://d1.islamhouse.com/html/faq.htm" target="_blank" rel="noreferrer" className="text-emerald-800 underline">شروط المصدر</a><a href="https://github.com/rn0x/Adhkar-json" target="_blank" rel="noreferrer" className="text-emerald-800 underline">مصدر النصوص والفهرس الفردي</a></div></section>
  </div></main>
}
