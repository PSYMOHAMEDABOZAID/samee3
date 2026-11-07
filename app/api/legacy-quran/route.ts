/**
 * SAMEE3 legacy Quran (progressively enhanced): full HTML works without JavaScript.
 * Verse highlighting follows ONLY the real timings of the exact collected Alafasy recording.
 * No guessed timings and no reuse across reciters or riwayat.
 */
import { NextRequest } from 'next/server'
import { GET as getQuran } from '../quran/route'
import {
  DEFAULT_LEGACY_RECITER,
  legacyAudioPageUrl,
  legacyQuranPageUrl,
  legacyReciterOptions,
  legacySurahAudioUrl,
  selectLegacyReciter,
} from '@/lib/legacy-reciters'

export const dynamic = 'force-dynamic'

const riwayat: Record<string, string> = {
  hafs: 'حفص عن عاصم', warsh: 'ورش عن نافع', qalun: 'قالون عن نافع',
  douri: 'الدوري', shubah: 'شعبة عن عاصم', sousi: 'السوسي', bazzi: 'البزي',
}

type PageAyah = {
  text?: string
  numberInSurah?: number
  surah?: { number?: number; name?: string }
}

function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (char) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] || char)
}

function htmlResponse(contents: string, status = 200) {
  return new Response(contents, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=30, s-maxage=120',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}

function link(page: number, riwaya: string, reciter: string) {
  return legacyQuranPageUrl(page, riwaya, reciter)
}

function shell(body: string, title: string, page: number, riwaya: string, reciter: string) {
  const choices = Object.keys(riwayat)
    .map((key) => `<option value="${key}"${key === riwaya ? ' selected' : ''}>${escapeHtml(riwayat[key])}</option>`)
    .join('')
  return `<!doctype html><html lang="ar" dir="rtl"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} | مصحف سميع</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#f5f0e5;color:#214a3d;font-family:Tahoma,Arial,sans-serif;font-size:17px;line-height:1.8}
header,footer{padding:11px 18px;background:#184a3f;color:white}header a,footer a{color:white}
.wrap{max-width:900px;margin:15px auto;padding:14px}h1{text-align:center;font-size:24px;color:#194f43;margin:8px 0 16px}
.page{border:2px solid #c5a269;border-radius:14px;background:#fffdf7;padding:25px 18px;text-align:center;line-height:2.45;font-size:26px}
.ayah{display:inline;color:#263e34;border-radius:7px;padding:2px 2px;-webkit-box-decoration-break:clone;box-decoration-break:clone;
transition:background-color .22s ease,box-shadow .22s ease}
.ayah .num{color:#946b2d;font-size:18px;white-space:nowrap}
.ayah.is-current{background:#fce9a8;background:linear-gradient(120deg,#fff1bd,#f8df91);
box-shadow:0 0 0 2px rgba(183,125,27,.38),0 4px 16px rgba(153,112,30,.15);
color:#182e27;text-shadow:0 0 1px rgba(255,255,255,.3)}
.ayah.is-selected:not(.is-current){background:#e5f0df;box-shadow:0 0 0 1px #8cae93}
.ayah.verse-clickable{cursor:pointer}.ayah.verse-clickable:focus{outline:2px solid #0d6650;outline-offset:3px}
.bar{padding:12px 0;text-align:center}.player{margin:18px 0;background:#fbfaf5;border:1px solid #d3bd93;border-radius:13px;padding:14px}
.player h2{font-size:20px;margin:0;color:#194f43}.muted{font-size:14px;color:#5a625e;margin:6px 0}
.current-info{font-size:16px;background:#e9f2e9;color:#194c3d;border-right:4px solid #4a8a6d;border-radius:7px;padding:10px 13px;margin:10px auto;min-height:45px}
.follow-setting{display:inline-block;margin:6px 0;font-size:14px}.follow-setting input{width:18px;height:18px;vertical-align:middle}
a.button,button{display:inline-block;border:1px solid #b6965b;background:#194f43;color:white;padding:8px 14px;margin:5px;border-radius:8px;text-decoration:none;font:bold 15px Tahoma,Arial;cursor:pointer}
a.plain{color:#196c57}select,input{font:16px Tahoma,Arial;padding:8px;max-width:100%;border-radius:6px;border:1px solid #c5a269}
label{display:inline-block;margin:4px}audio{display:block;width:100%;max-width:100%;margin:10px 0}
.note{text-align:center;font-size:13px;color:#606760}
@media(max-width:600px){.wrap{padding:8px}.page{font-size:22px;line-height:2.3;padding:13px 9px}h1{font-size:21px}}
@media(prefers-reduced-motion:reduce){.ayah{transition:none}}
</style></head><body><header><a href="/legacy/index.html">مصحف سميع — النسخة الخفيفة</a></header>
<main class="wrap"><h1>${escapeHtml(title)}</h1>
<form action="/api/legacy-quran" method="get" class="bar">
<label>الرواية <select name="riwaya">${choices}</select></label>
<label>القارئ <select name="reciter">${legacyReciterOptions(reciter)}</select></label>
<label>صفحة <input name="page" type="number" min="1" max="604" value="${page}" size="4"></label>
<button type="submit">انتقال</button></form>
${body}
<nav class="bar">${page > 1 ? `<a class="button" href="${link(page - 1, riwaya, reciter)}">الصفحة السابقة</a>` : ''}${page < 604 ? `<a class="button" href="${link(page + 1, riwaya, reciter)}">الصفحة التالية</a>` : ''}</nav>
<p class="note">الآيات من مصدر سميع دون تعديل. التظليل التلقائي يعمل فقط مع توقيتات التسجيل المتطابقة وعند دعم المتصفح للصوت وJavaScript.</p>
</main><footer><a href="/legacy/index.html">العودة للأقسام والتحميلات</a></footer>
<script src="/legacy/ayah-highlight.js?v=1"></script></body></html>`
}

export async function GET(request: NextRequest) {
  const rawPage = request.nextUrl.searchParams.get('page') || '1'
  const page = /^\d{1,3}$/.test(rawPage) ? Number(rawPage) : 0
  const rawRiwaya = (request.nextUrl.searchParams.get('riwaya') || 'hafs').toLowerCase()
  const riwaya = Object.prototype.hasOwnProperty.call(riwayat, rawRiwaya) ? rawRiwaya : 'hafs'
  const reciter = selectLegacyReciter(request.nextUrl.searchParams.get('reciter'))
  if (page < 1 || page > 604) {
    return htmlResponse(shell('<p>رقم الصفحة يجب أن يكون بين 1 و604.</p>', 'رقم الصفحة غير صحيح', 1, riwaya, reciter.id), 400)
  }
  try {
    // Reuses the SAMEE3 Quran API; never duplicate Quran verses in this route.
    const url = new URL('/api/quran', request.url)
    url.searchParams.set('page', String(page))
    url.searchParams.set('riwaya', riwaya)
    const sourceResponse = await getQuran(new NextRequest(url))
    if (!sourceResponse.ok) throw new Error('Quran API unavailable')
    const data = await sourceResponse.json() as { success?: boolean; ayahs?: PageAyah[] }
    if (!data.success || !Array.isArray(data.ayahs) || !data.ayahs.length) throw new Error('No Quran text')
    const ayahs = data.ayahs.filter((ayah) =>
      typeof ayah.text === 'string' && ayah.text.trim().length > 0 &&
      Number.isInteger(Number(ayah.numberInSurah)) && Number(ayah.numberInSurah) > 0 &&
      Number.isInteger(Number(ayah.surah?.number)) && Number(ayah.surah?.number) >= 1 && Number(ayah.surah?.number) <= 114)
    if (!ayahs.length) throw new Error('No valid ayahs')
    const surahNumbers = Array.from(new Set(ayahs.map((ayah) => Number(ayah.surah?.number))))
    const surahNames = Array.from(new Set(ayahs.map((ayah) => ayah.surah?.name).filter((value): value is string => Boolean(value)))).join('، ')
    const requestedSurah = Number(request.nextUrl.searchParams.get('surah'))
    const playedSurah = surahNumbers.includes(requestedSurah) ? requestedSurah : surahNumbers[0]
    const fromBeginning = request.nextUrl.searchParams.get('from') === 'beginning'
    const firstVisibleAyah = ayahs.find((ayah) => ayah.surah?.number === playedSurah)
    const initialAyah = fromBeginning ? 1 : Number(firstVisibleAyah?.numberInSurah || 1)
    const content = ayahs.map((ayah) => {
      const surah = Number(ayah.surah?.number)
      const ayahNumber = Number(ayah.numberInSurah)
      return `<span id="verse-${surah}-${ayahNumber}" class="ayah" data-surah="${surah}" data-ayah="${ayahNumber}" tabindex="0">${escapeHtml(ayah.text)} <span class="num">۞ ${ayahNumber}</span></span>`
    }).join(' ')
    const title = `الصفحة ${page} — ${surahNames || 'القرآن الكريم'} — ${riwayat[riwaya]}`
    let audio = ''
    if (riwaya === 'hafs') {
      const source = await legacySurahAudioUrl(reciter, playedSurah)
      const playedName = ayahs.find((ayah) => ayah.surah?.number === playedSurah)?.surah?.name || `السورة ${playedSurah}`
      const surahPicker = surahNumbers.length > 1 ? `<form action="/api/legacy-quran" method="get" class="bar">
<input type="hidden" name="page" value="${page}"><input type="hidden" name="riwaya" value="hafs"><input type="hidden" name="reciter" value="${escapeHtml(reciter.id)}">
<label>السورة المسموعة <select name="surah">${surahNumbers.map((n) => `<option value="${n}"${n === playedSurah ? ' selected' : ''}>${escapeHtml(ayahs.find((a) => a.surah?.number === n)?.surah?.name || 'سورة ' + n)}</option>`).join('')}</select></label><button type="submit">اختيار</button></form>` : ''
      const isCollected = reciter.id === DEFAULT_LEGACY_RECITER
      const timingUrl = isCollected ? `/api/alafasy-timings/${playedSurah}` : ''
      const player = source ? `<audio id="legacy-quran-audio" controls preload="metadata" src="${escapeHtml(source)}" data-surah="${playedSurah}" data-start-ayah="${initialAyah}" data-timings-url="${timingUrl}">المتصفح لا يدعم تشغيل MP3.</audio>
<p class="muted"><a class="plain" href="${escapeHtml(source)}">فتح ملف MP3 مباشرة</a> · <a class="plain" href="${link(page, riwaya, reciter.id)}&amp;surah=${playedSurah}&amp;from=beginning">تشغيل السورة من البداية</a></p>`
        : '<p role="alert">تعذر تحديد ملف تسجيل هذا القارئ. لا نستبدله بتسجيل آخر.</p>'
      const status = source ? (isCollected
        ? 'جاري فحص توقيتات الآيات الأصلية؛ التلاوة متاحة حتى إذا لم تعمل خاصية التظليل.'
        : 'يمكنك تحديد الآية يدويًا. التظليل الصوتي التلقائي غير مفعل لهذا القارئ دون توقيتات مطابقة لتسجيله.')
        : 'يمكن تحديد الآيات يدويًا إذا كان المتصفح يدعم JavaScript.'
      audio = `<section class="player" aria-label="المشغل وتظليل الآيات"><h2>${escapeHtml(reciter.name)} — ${escapeHtml(playedName)}</h2>
<p class="muted">${isCollected ? 'المصحف المجمّع الأصلي؛ يُستخدم توقيته الخاص فقط' : 'تلاوة برواية حفص'} — ${initialAyah > 1 ? 'تبدأ من أول آية ظاهرة عند توفر التوقيت وطلب التشغيل' : 'تبدأ من أول السورة'}</p>
${surahPicker}${player}
<div id="legacy-highlight-status" class="current-info" role="status">${status}</div>
<label class="follow-setting"><input id="legacy-follow-ayah" type="checkbox" checked> متابعة الآية تلقائيًا عند القراءة</label>
<p class="muted">اضغط على الآية لتحديدها؛ ومع المصحف المجمّع يمكنك الانتقال لموضعها بالصوت. لا يعمل التظليل التلقائي دون JavaScript.</p>
<p><a class="plain" href="${legacyAudioPageUrl(playedSurah, reciter.id)}">مشغل السور وتغيير القارئ</a></p></section>`
    } else {
      audio = `<section class="player"><p class="muted">صوت القراء المتاح هنا برواية حفص فقط، ولا يُعرض تلقائيًا على صفحة ${escapeHtml(riwayat[riwaya])} حتى لا تختلط الروايات.</p><a class="plain" href="/legacy/audio/index.html">المكتبة الصوتية</a></section>`
    }
    return htmlResponse(shell(`<div class="page" id="legacy-quran-page" role="article" aria-label="آيات الصفحة ${page}">${content}</div>${audio}`, title, page, riwaya, reciter.id))
  } catch {
    return htmlResponse(shell(`<p role="alert">تعذر تحميل آيات الصفحة من مصدر سميع. تحقق من الاتصال وأعد المحاولة.</p><p><a class="button" href="${link(page, riwaya, reciter.id)}">إعادة المحاولة</a></p>`, 'المصحف', page, riwaya, reciter.id), 503)
  }
}
