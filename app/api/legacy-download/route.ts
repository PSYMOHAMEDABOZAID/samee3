/**
 * Browser-independent download links. No client JavaScript or React is required.
 * Never point to a release asset that has not been published.
 */
import { NextRequest, NextResponse } from 'next/server'
import androidRelease from '@/public/android/release.json'
import desktopConfig from '@/public/app-downloads.json'

export const dynamic = 'force-dynamic'

type ReleaseAsset = {
  name?: string
  state?: string
  size?: number
  browser_download_url?: string
}

type Release = { assets?: ReleaseAsset[] }

const repository = 'PSYMOHAMEDABOZAID/samee3'
const releaseRoot = `https://github.com/${repository}/releases`

const kinds: Record<string, { tag: string; file: string; minBytes: number; title: string }> = {
  tv: { tag: 'samee3-tv', file: 'SAMEE3-TV.apk', minBytes: 1_000_000, title: 'Android TV APK' },
  webos: { tag: 'samee3-tv', file: 'SAMEE3-webOS.ipk', minBytes: 1_000, title: 'LG webOS IPK' },
  windows: { tag: desktopConfig.releaseTag, file: desktopConfig.windows[0].assetName, minBytes: 100_000, title: 'Windows EXE' },
  'mac-arm': { tag: desktopConfig.releaseTag, file: desktopConfig.macos.find((entry) => entry.id === 'apple-silicon')?.assetName || '', minBytes: 100_000, title: 'Mac Apple Silicon' },
  'mac-intel': { tag: desktopConfig.releaseTag, file: desktopConfig.macos.find((entry) => entry.id === 'intel')?.assetName || '', minBytes: 100_000, title: 'Mac Intel' },
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] || char)
}

function errorHtml(message: string, releasesPage: string, code = 404, directUrl?: string) {
  const html = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>تحميل تطبيق سميع</title><style>body{background:#f8f4e9;color:#194f43;font:18px Arial,Tahoma,sans-serif;line-height:1.8;margin:0;padding:25px}.wrap{max-width:620px;margin:25px auto;padding:24px;background:white;border:1px solid #d9c39d;border-radius:16px}a{display:inline-block;color:#194f43;margin:10px 0;font-weight:bold}</style></head><body><div class="wrap"><h1>مصحف سميع</h1><p>${escapeHtml(message)}</p><p><a href="${escapeHtml(releasesPage)}">عرض الإصدارات الرسمية</a></p>${directUrl ? `<p><a href="${escapeHtml(directUrl)}">تجربة رابط الملف المباشر على GitHub (قد يكون غير منشور)</a></p>` : ''}<p><a href="/legacy/index.html">العودة لنسخة الأجهزة القديمة</a></p></div></body></html>`
  return new Response(html, { status: code, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } })
}

async function fetchRelease(tag: string): Promise<Release | null> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 7000)
  try {
    const response = await fetch(`https://api.github.com/repos/${repository}/releases/tags/${encodeURIComponent(tag)}`, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Samee3-Compatibility-Download' },
      next: { revalidate: 300 },
      signal: controller.signal,
    })
    if (!response.ok) return null
    return (await response.json()) as Release
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}

export async function GET(request: NextRequest) {
  const kind = request.nextUrl.searchParams.get('kind') || ''
  if (kind === 'android') {
    if (!androidRelease.available || !/^\/android\/[A-Za-z0-9._-]+\.apk$/.test(androidRelease.apkPath)) {
      return errorHtml('ملف أندرويد لم يُنشر بعد.', '/legacy/index.html')
    }
    return NextResponse.redirect(new URL(androidRelease.apkPath, request.url), { status: 302, headers: { 'Cache-Control': 'no-store' } })
  }
  const choice = Object.prototype.hasOwnProperty.call(kinds, kind) ? kinds[kind] : undefined
  if (!choice || !choice.file) return errorHtml('نوع الملف المطلوب غير معروف.', '/legacy/index.html', 400)
  const releasesPage = `${releaseRoot}/tag/${encodeURIComponent(choice.tag)}`
  const data = await fetchRelease(choice.tag)
  const expectedUrl = `${releaseRoot}/download/${choice.tag}/${choice.file}`
  const asset = data?.assets?.find((entry) =>
    entry.name === choice.file &&
    entry.state === 'uploaded' &&
    typeof entry.size === 'number' && entry.size > choice.minBytes &&
    entry.browser_download_url === expectedUrl
  )
  if (!asset) {
    return errorHtml(`لم أتمكن من التأكد من نشر ملف ${choice.title} حاليًا. يمكنك مراجعة الإصدار الرسمي أو تجربة رابط الملف المباشر.`, releasesPage, 503, expectedUrl)
  }
  return NextResponse.redirect(expectedUrl, { status: 302, headers: { 'Cache-Control': 'no-store' } })
}
