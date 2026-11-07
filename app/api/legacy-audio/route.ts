/** Lightweight MP3 player: server-rendered and no JavaScript required. */
import { NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'
const names = 'الفاتحة|البقرة|آل عمران|النساء|المائدة|الأنعام|الأعراف|الأنفال|التوبة|يونس|هود|يوسف|الرعد|إبراهيم|الحجر|النحل|الإسراء|الكهف|مريم|طه|الأنبياء|الحج|المؤمنون|النور|الفرقان|الشعراء|النمل|القصص|العنكبوت|الروم|لقمان|السجدة|الأحزاب|سبأ|فاطر|يس|الصافات|ص|الزمر|غافر|فصلت|الشورى|الزخرف|الدخان|الجاثية|الأحقاف|محمد|الفتح|الحجرات|ق|الذاريات|الطور|النجم|القمر|الرحمن|الواقعة|الحديد|المجادلة|الحشر|الممتحنة|الصف|الجمعة|المنافقون|التغابن|الطلاق|التحريم|الملك|القلم|الحاقة|المعارج|نوح|الجن|المزمل|المدثر|القيامة|الإنسان|المرسلات|النبأ|النازعات|عبس|التكوير|الانفطار|المطففين|الانشقاق|البروج|الطارق|الأعلى|الغاشية|الفجر|البلد|الشمس|الليل|الضحى|الشرح|التين|العلق|القدر|البينة|الزلزلة|العاديات|القارعة|التكاثر|العصر|الهمزة|الفيل|قريش|الماعون|الكوثر|الكافرون|النصر|المسد|الإخلاص|الفلق|الناس'.split('|')
const base = 'https://cdn.mp3quran.net/audio/mishary-alafasy/r1/'
function response(html: string, code = 200) {
  return new Response(html, { status: code, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=300', 'X-Content-Type-Options': 'nosniff' } })
}
export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get('surah') || '1'
  const number = /^\d{1,3}$/.test(raw) ? Number(raw) : 0
  if (number < 1 || number > 114) return response('<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><p>رقم السورة غير صحيح.</p><a href="/legacy/audio/index.html">القائمة</a></html>', 400)
  const padded = String(number).padStart(3, '0')
  const file = `${base}${padded}.mp3`
  const alternate = `https://server8.mp3quran.net/afs/${padded}.mp3`
  const label = names[number - 1]
  const prev = number > 1 ? `<a href="/api/legacy-audio?surah=${number - 1}">السورة السابقة</a>` : ''
  const next = number < 114 ? `<a href="/api/legacy-audio?surah=${number + 1}">السورة التالية</a>` : ''
  const options = names.map((name, i) => `<option value="${i + 1}"${i + 1 === number ? ' selected' : ''}>${i + 1} — ${name}</option>`).join('')
  return response(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>سورة ${label} — مصحف سميع</title><style>body{margin:0;background:#f7f2e7;font:17px/1.85 Tahoma,Arial,sans-serif;color:#194f43}.box{max-width:650px;padding:24px;margin:30px auto;background:#fffdf9;border:1px solid #d9c39d;border-radius:17px}header{text-align:center}h1{font-size:27px}audio{display:block;width:100%;max-width:100%;margin:20px 0}a,button{display:inline-block;margin:6px;padding:10px 14px;border:1px solid #b9945f;border-radius:9px;background:#194f43;color:#fff;text-decoration:none;font:16px Tahoma}a.out{background:#fff;color:#194f43}select{font-size:16px;padding:9px;border:1px solid #b9945f}form{margin:12px 0}p{font-size:14px;color:#555}</style></head><body><div class="box"><header><h1>سورة ${label}</h1><div>مشاري العفاسي — رواية حفص</div></header><audio controls preload="none" src="${file}">متصفحك لا يدعم تشغيل MP3.</audio><p>لو المشغل لا يعمل على متصفح الشاشة، افتح ملف الصوت مباشرة أو حمّله على جهاز آخر.</p><a href="${file}" class="out">فتح ملف MP3 مباشرة</a><a href="${alternate}" class="out">مصدر MP3 بديل</a><form action="/api/legacy-audio" method="get"><label>اختيار سورة <select name="surah">${options}</select></label><button type="submit">تشغيل</button></form><nav>${prev}${next}</nav><div><a href="/legacy/audio/index.html" class="out">كل السور</a><a href="/legacy/index.html" class="out">الرئيسية الخفيفة</a></div></div></body></html>`)
}
