/**
 * Server-rendered Quran page for older browsers, including no-JavaScript browsers.
 * Reuses SAMEE3's existing verified page API and never replaces Quran text.
 */
import { NextRequest } from 'next/server'
import { GET as getQuran } from '../quran/route'

export const dynamic = 'force-dynamic'

const riwayat: Record<string, string> = {
  hafs: 'حفص عن عاصم', warsh: 'ورش عن نافع', qalun: 'قالون عن نافع',
  douri: 'الدوري', shubah: 'شعبة عن عاصم', sousi: 'السوسي', bazzi: 'البزي',
}

function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] || char)
}
function htmlResponse(contents: string, status = 200) {
  return new Response(contents, { status, headers: {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'public, max-age=60, s-maxage=300',
    'X-Content-Type-Options': 'nosniff',
  } })
}
function link(page: number, riwaya: string) {
  return `/api/legacy-quran?page=${page}&riwaya=${encodeURIComponent(riwaya)}`
}
function shell(body: string, title: string, page: number, riwaya: string) {
  const choices = Object.keys(riwayat).map((key) => `<option value="${key}"${key === riwaya ? ' selected' : ''}>${escapeHtml(riwayat[key])}</option>`).join('')
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)} | مصحف سميع</title><style>
  body{margin:0;background:#f7f2e7;color:#214a3d;font-family:Tahoma,Arial,sans-serif;font-size:18px;line-height:1.85}header,footer{padding:12px 18px;background:#194f43;color:#fff}header a,footer a{color:#fff}.wrap{max-width:830px;margin:15px auto;padding:15px}h1{text-align:center;font-size:25px;color:#194f43}.page{border:2px solid #c5a269;border-radius:16px;background:#fffdf7;padding:23px 16px;text-align:center;line-height:2.35;font-size:26px}.ayah{display:inline}.num{color:#90682f;font-size:19px}.bar{padding:15px 0;text-align:center}a.button,button{display:inline-block;border:1px solid #bf9a60;background:#194f43;color:white;padding:8px 15px;margin:5px;border-radius:9px;text-decoration:none;font:bold 16px Tahoma,Arial}select,input{font-size:17px;padding:8px;max-width:100%;border-radius:6px;border:1px solid #c5a269}p.note{text-align:center;font-size:14px;color:#666}audio{max-width:100%;width:100%}@media(max-width:600px){.page{font-size:22px;line-height:2.25;padding:14px 9px}.wrap{padding:9px}}
  </style></head><body><header><a href="/legacy/index.html">مصحف سميع — النسخة الخفيفة</a></header><main class="wrap"><h1>${escapeHtml(title)}</h1><form action="/api/legacy-quran" method="get" class="bar"><label>الرواية <select name="riwaya">${choices}</select></label> <label>صفحة <input name="page" type="number" min="1" max="604" value="${page}" size="4"></label> <button type="submit">انتقال</button></form>${body}<nav class="bar">${page > 1 ? `<a class="button" href="${link(page - 1, riwaya)}">الصفحة السابقة</a>` : ''}${page < 604 ? `<a class="button" href="${link(page + 1, riwaya)}">الصفحة التالية</a>` : ''}</nav><p class="note">تُعرض الآيات من مصدر سميع نفسه. تشغيل التلاوة يعتمد على دعم MP3 واتصال الإنترنت.</p></main><footer><a href="/legacy/index.html">العودة إلى الأقسام والتحميلات</a></footer></body></html>`
}

export async function GET(request: NextRequest) {
  const rawPage = request.nextUrl.searchParams.get('page') || '1'
  const page = /^\d{1,3}$/.test(rawPage) ? Number(rawPage) : 0
  const rawRiwaya = (request.nextUrl.searchParams.get('riwaya') || 'hafs').toLowerCase()
  const riwaya = Object.prototype.hasOwnProperty.call(riwayat, rawRiwaya) ? rawRiwaya : 'hafs'
  if (page < 1 || page > 604) {
    return htmlResponse(shell('<p>رقم الصفحة يجب أن يكون بين 1 و604.</p>', 'رقم الصفحة غير صحيح', 1, riwaya), 400)
  }
  try {
    const url = new URL('/api/quran', request.url)
    url.searchParams.set('page', String(page))
    url.searchParams.set('riwaya', riwaya)
    const response = await getQuran(new NextRequest(url))
    if (!response.ok) throw new Error('API unavailable')
    const data = await response.json() as {
      success?: boolean
      ayahs?: Array<{ text?: string; numberInSurah?: number; surah?: { name?: string; number?: number } }>
    }
    if (!data.success || !Array.isArray(data.ayahs) || !data.ayahs.length) throw new Error('No Quran text')
    const content = data.ayahs.map((ayah) => `<span class="ayah">${escapeHtml(ayah.text)} <span class="num">۞ ${escapeHtml(ayah.numberInSurah)} </span></span>`).join(' ')
    const surahNumbers = Array.from(new Set(data.ayahs.map((ayah) => ayah.surah?.number).filter((value): value is number => typeof value === 'number' && value >= 1 && value <= 114)))
    const surahNames = Array.from(new Set(data.ayahs.map((ayah) => ayah.surah?.name).filter((value): value is string => Boolean(value)))).join('، ')
    const heading = `الصفحة ${page} — ${surahNames || 'القرآن الكريم'} — ${riwayat[riwaya]}`
    let audio = ''
    if (riwaya === 'hafs' && surahNumbers.length) {
      const n = String(surahNumbers[0]).padStart(3, '0')
      const src = `https://cdn.mp3quran.net/audio/mishary-alafasy/r1/${n}.mp3`
      audio = `<section class="bar"><p>الاستماع لسورة ${escapeHtml(surahNames.split('،')[0])} كاملة — مشاري العفاسي</p><audio controls preload="none" src="${src}">المتصفح لا يدعم مشغل MP3.</audio><p><a href="${src}">فتح الصوت مباشرة</a></p></section>`
    }
    return htmlResponse(shell(`<div class="page" role="article">${content}</div>${audio}`, heading, page, riwaya))
  } catch {
    return htmlResponse(shell('<p role="alert">تعذّر تحميل آيات الصفحة من مصدر سميع حاليًا. تأكد من اتصال الإنترنت ثم أعد المحاولة.</p><p><a href="/api/legacy-quran?page=1">إعادة المحاولة</a></p>', 'المصحف', page, riwaya), 503)
  }
}
