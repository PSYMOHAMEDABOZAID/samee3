import { NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
export async function GET() {
  const repository = 'PSYMOHAMEDABOZAID/samee3'
  try {
    const response = await fetch(`https://api.github.com/repos/${repository}/releases/tags/samee3-tv`, { headers: { Accept: 'application/vnd.github+json' }, next: { revalidate: 300 }, signal: AbortSignal.timeout(7000) })
    if (!response.ok) return NextResponse.json({ apk: null })
    const data = await response.json() as { assets?: { name: string; state: string; size: number; browser_download_url: string }[] }
    const url = `https://github.com/${repository}/releases/download/samee3-tv/SAMEE3-TV.apk`
    const asset = data.assets?.find(item => item.name === 'SAMEE3-TV.apk' && item.state === 'uploaded' && item.size > 1000000 && item.browser_download_url === url)
    const webosUrl = `https://github.com/${repository}/releases/download/samee3-tv/SAMEE3-webOS.ipk`
    const webos = data.assets?.find(item => item.name === 'SAMEE3-webOS.ipk' && item.state === 'uploaded' && item.size > 1000 && item.browser_download_url === webosUrl)
    return NextResponse.json({ apk: asset ? url : null, webos: webos ? webosUrl : null })
  } catch { return NextResponse.json({ apk: null }) }
}
