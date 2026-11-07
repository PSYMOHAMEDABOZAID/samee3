/** SAMEE3: no-JavaScript audio player with the compiled Alafasy as default. */
import { NextRequest } from 'next/server'
import {
  DEFAULT_LEGACY_RECITER, legacyAudioPageUrl, legacyReciterOptions,
  legacySurahAudioUrl, selectLegacyReciter, collectedOriginalUrl,
} from '@/lib/legacy-reciters'

export const dynamic = 'force-dynamic'
const names = 'الفاتحة|البقرة|آل عمران|النساء|المائدة|الأنعام|الأعراف|الأنفال|التوبة|يونس|هود|يوسف|الرعد|إبراهيم|الحجر|النحل|الإسراء|الكهف|مريم|طه|الأنبياء|الحج|المؤمنون|النور|الفرقان|الشعراء|النمل|القصص|العنكبوت|الروم|لقمان|السجدة|الأحزاب|سبأ|فاطر|يس|الصافات|ص|الزمر|غافر|فصلت|الشورى|الزخرف|الدخان|الجاثية|الأحقاف|محمد|الفتح|الحجرات|ق|الذاريات|الطور|النجم|القمر|الرحمن|الواقعة|الحديد|المجادلة|الحشر|الممتحنة|الصف|الجمعة|المنافقون|التغابن|الطلاق|التحريم|الملك|القلم|الحاقة|المعارج|نوح|الجن|المزمل|المدثر|القيامة|الإنسان|المرسلات|النبأ|النازعات|عبس|التكوير|الانفطار|المطففين|الانشقاق|البروج|الطارق|الأعلى|الغاشية|الفجر|البلد|الشمس|الليل|الضحى|الشرح|التين|العلق|القدر|البينة|الزلزلة|العاديات|القارعة|التكاثر|العصر|الهمزة|الفيل|قريش|الماعون|الكوثر|الكافرون|النصر|المسد|الإخلاص|الفلق|الناس'.split('|')

function response(html: string, code = 200) {
  return new Response(html, { status: code, headers: {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'public, max-age=60, s-maxage=180',
    'X-Content-Type-Options': 'nosniff',
  } })
}
function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] || char)
}

export async function GET(request: NextRequest) {
  const rawSurah = request.nextUrl.searchParams.get('surah') || '1'
  const surah = /^\d{1,3}$/.test(rawSurah) ? Number(rawSurah) : 0
  if (surah < 1 || surah > 114) return response('<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><p>رقم السورة غير صحيح.</p><a href="/legacy/audio/index.html">القائمة</a></html>', 400)
  const reciter = selectLegacyReciter(request.nextUrl.searchParams.get('reciter'))
  const surahName = names[surah - 1]
  const selectedUrl = await legacySurahAudioUrl(reciter, surah)
  const options = names.map((name, i) => `<option value="${i + 1}"${i + 1 === surah ? ' selected' : ''}>${i + 1} — ${escapeHtml(name)}</option>`).join('')
  const prev = surah > 1 ? `<a href="${legacyAudioPageUrl(surah - 1, reciter.id)}">السورة السابقة</a>` : ''
  const next = surah < 114 ? `<a href="${legacyAudioPageUrl(surah + 1, reciter.id)}">السورة التالية</a>` : ''
  const isCollected = reciter.id === DEFAULT_LEGACY_RECITER
  const audio = selectedUrl
    ? `<audio controls preload="none" src="${escapeHtml(selectedUrl)}">المتصفح لا يدعم تشغيل MP3.</audio><div class="links"><a class="light" href="${escapeHtml(selectedUrl)}">فتح ملف الصوت مباشرة</a>${isCollected ? `<a class="light" href="${collectedOriginalUrl(surah)}">ملف المصحف المجمع الأصلي (GitHub)</a>` : ''}</div>`
    : '<p role="alert" class="warning">لم نتمكن من تحديد تسجيل موثوق لهذه السورة بهذا القارئ حاليًا. جرّب قارئًا آخر؛ لن نستبدل التسجيل بصوت قارئ مختلف.</p>'
  return response(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>سورة ${escapeHtml(surahName)} — ${escapeHtml(reciter.name)} — مصحف سميع</title><style>
body{margin:0;background:#f7f2e7;font:17px/1.85 Tahoma,Arial,sans-serif;color:#194f43}.box{max-width:720px;padding:20px;margin:25px auto;background:#fffdf9;border:1px solid #d9c39d;border-radius:15px}header{text-align:center}h1{font-size:26px;margin:0}audio{display:block;width:100%;max-width:100%;margin:18px 0}a,button{display:inline-block;margin:5px;padding:10px 13px;border:1px solid #b9945f;border-radius:8px;background:#194f43;color:#fff;text-decoration:none;font:16px Tahoma,Arial}.light{background:#fff;color:#194f43}select{font:16px Tahoma,Arial;padding:9px;border:1px solid #b9945f;max-width:100%}form{margin:16px 0}label{display:block;margin:8px 0}p{font-size:14px;color:#555}.warning{padding:14px;background:#fff1e1;border:1px solid #ceaa6e}.links{margin:8px 0}nav{margin:15px 0}</style></head><body><main class="box"><header><h1>سورة ${escapeHtml(surahName)}</h1><strong>${escapeHtml(reciter.name)}</strong><p>${isCollected ? 'التسجيل الأصلي للمصحف المجمّع — ليس مصحف العفاسي العادي' : 'تلاوة برواية حفص عن عاصم'}</p></header>${audio}<form action="/api/legacy-audio" method="get"><label for="reciter">اختر القارئ:</label><select name="reciter" id="reciter">${legacyReciterOptions(reciter.id)}</select><label for="surah">اختر السورة:</label><select id="surah" name="surah">${options}</select> <button type="submit">تشغيل السورة</button></form><nav>${prev}${next}</nav><div><a class="light" href="/legacy/audio/index.html">فهرس السور</a><a class="light" href="/api/legacy-quran?page=1&amp;riwaya=hafs&amp;reciter=${encodeURIComponent(reciter.id)}">قراءة المصحف</a><a class="light" href="/legacy/index.html">الرئيسية الخفيفة</a></div><p>يمكنك فتح رابط MP3 مباشرةً إن لم يظهر المشغل؛ تحتاج بعض المتصفحات القديمة دعمًا لملفات MP3 وHTTPS.</p></main></body></html>`)
}
