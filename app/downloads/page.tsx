import Link from 'next/link'
import AppDownloadsCard from '@/components/AppDownloadsCard'

export const metadata = { title: 'تحميل تطبيق مصحف سميع لأندرويد وويندوز والماك' }

/** Render download links on the server, even when hydration is unavailable. */
export default function DownloadsPage() {
  return <main dir="rtl" className="min-h-screen bg-[var(--bg-main)] px-4 pb-32 pt-7">
    <div className="mx-auto max-w-3xl">
      <Link href="/" className="text-sm font-bold text-[#194f43]">→ العودة للرئيسية</Link>
      <header className="my-6">
        <h1 className="text-2xl font-extrabold text-[#194f43]">سميع معك على أجهزتك</h1>
        <p className="mt-2 text-sm leading-7 text-slate-600">حمّل النسخة المناسبة لجهازك، واحتفظ بالقرآن بالقرب منك.</p>
      </header>
      <section aria-label="روابط تنزيل لا تحتاج JavaScript" className="mb-6 rounded-3xl border border-[#d9c39d] bg-white p-5">
        <h2 className="mb-2 text-base font-bold text-[#194f43]">تحميل مباشر يعمل أيضًا على المتصفحات القديمة</h2>
        <p className="mb-3 text-xs leading-7 text-slate-600">الروابط التالية لا تعتمد على تشغيل واجهة الموقع. لو ملف الإصدار غير منشور ستظهر رسالة واضحة بدل زر لا يعمل.</p>
        <div className="flex flex-wrap gap-2">
          <a className="inline-block rounded-xl bg-[#194f43] px-4 py-3 text-xs font-bold text-white" href="/api/legacy-download?kind=tv">تحميل Android TV APK</a>
          <a className="inline-block rounded-xl border border-[#d9c39d] px-4 py-3 text-xs font-bold text-[#194f43]" href="/api/legacy-download?kind=android">تحميل أندرويد</a>
          <a className="inline-block rounded-xl border border-[#d9c39d] px-4 py-3 text-xs font-bold text-[#194f43]" href="/api/legacy-download?kind=webos">تحميل LG webOS</a>
          <a className="inline-block rounded-xl border border-[#d9c39d] px-4 py-3 text-xs font-bold text-[#194f43]" href="/api/legacy-download?kind=windows">تحميل Windows</a>
          <a className="inline-block rounded-xl border border-[#d9c39d] px-4 py-3 text-xs font-bold text-[#194f43]" href="/api/legacy-download?kind=mac-arm">Mac Apple Silicon</a>
          <a className="inline-block rounded-xl border border-[#d9c39d] px-4 py-3 text-xs font-bold text-[#194f43]" href="/api/legacy-download?kind=mac-intel">Mac Intel</a>
          <a className="inline-block rounded-xl border border-[#d9c39d] px-4 py-3 text-xs font-bold text-[#194f43]" href="/legacy/index.html">واجهة الأجهزة القديمة</a>
        </div>
      </section>
      <AppDownloadsCard detailed />
    </div>
  </main>
}
