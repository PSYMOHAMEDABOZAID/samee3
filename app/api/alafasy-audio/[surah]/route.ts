import { ALAFASY_COLLECTED_RELEASE } from '@/lib/quran/alafasy-collected'

export const runtime = 'edge'
export const dynamic = 'force-dynamic'
type Context = { params: Promise<{ surah: string }> }

function failure(code: number, message: string): Response {
  return Response.json({error:message}, {status:code,headers:{'Cache-Control':'no-store'}})
}
async function relay(request: Request, context: Context): Promise<Response> {
  const {surah} = await context.params
  const match = /^(\d{1,3})(?:\.mp3)?$/.exec(surah)
  const no = match ? Number(match[1]) : NaN
  if (!Number.isInteger(no) || no<1 || no>114) return failure(400,'Invalid surah')
  const file = `${String(no).padStart(3,'0')}.mp3`
  const url = `${ALAFASY_COLLECTED_RELEASE}/${file}`
  const diagnostic = new URL(request.url).searchParams.get('check')==='1'
  const outgoing = new Headers()
  const range = diagnostic ? 'bytes=0-1' : request.headers.get('range')
  if (range) {
    if (!/^bytes=(?:\d+-\d*|-\d+)$/.test(range)) return failure(416,'Invalid Range')
    outgoing.set('Range',range)
  }
  let upstream: Response
  try {
    upstream=await fetch(url,{headers:outgoing,redirect:'follow',cache:'no-store',signal:request.signal})
  } catch {
    return failure(502,'Collected audio host unavailable')
  }
  const mime=(upstream.headers.get('Content-Type')||'').toLowerCase()
  const valid=(upstream.status===200 || upstream.status===206) &&
    !/(text\/html|application\/json|text\/plain)/.test(mime) && !!upstream.body
  if (diagnostic) {
    await upstream.body?.cancel().catch(()=>undefined)
    return Response.json({
      ok:valid && upstream.status===206,
      filename:file,
      upstreamStatus:upstream.status,
      contentType:mime,
      contentRange:upstream.headers.get('Content-Range'),
    },{headers:{'Cache-Control':'no-store'}})
  }
  if (!valid) {
    await upstream.body?.cancel().catch(()=>undefined)
    return failure(502,'Collected audio unavailable: '+upstream.status)
  }
  if (range && upstream.status!==206) {
    await upstream.body?.cancel().catch(()=>undefined)
    return failure(502,'Collected audio host does not support Range')
  }
  const headers=new Headers({
    'Content-Type':'audio/mpeg',
    'Cache-Control':'no-store',
    'Content-Disposition':`inline; filename="${file}"`,
    'X-Content-Type-Options':'nosniff',
  })
  for (const key of ['content-length','content-range','accept-ranges','etag','last-modified']) {
    const value=upstream.headers.get(key)
    if (value) headers.set(key,value)
  }
  if (upstream.status===206) headers.set('Accept-Ranges','bytes')
  return new Response(upstream.body,{status:upstream.status,headers})
}
export async function GET(request:Request,context:Context):Promise<Response> {
  return relay(request,context)
}
