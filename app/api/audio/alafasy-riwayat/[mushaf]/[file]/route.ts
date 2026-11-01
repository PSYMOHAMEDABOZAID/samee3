/** Backward-compatible redirect for verified, explicitly mapped recordings. */
import { NextResponse } from 'next/server'
import catalog from '@/lib/alafasy-riwayat-manifest.json'
export const dynamic='force-dynamic'
type Entry={key:string;verified?:boolean;tracks?:Record<string,string>}
type Context={params:Promise<{mushaf:string;file:string}>}
export async function GET(_request:Request,{params}:Context):Promise<Response> {
  const {mushaf,file}=await params
  const match=/^(\d{3})\.mp3$/.exec(file)
  if (!match || Number(match[1])<1 || Number(match[1])>114)
    return new NextResponse('Not found',{status:404})
  const entry=(catalog.entries as Entry[]).find(e=>e.key===mushaf && e.verified===true)
  const audio=entry?.tracks?.[match[1]]
  if (!audio) return new NextResponse('Not found',{status:404})
  try {
    const url=new URL(audio)
    if (url.protocol!=='https:' || url.username || url.password ||
      !/^(?:[a-z0-9-]+\.)*mp3quran\.net$/i.test(url.hostname)) {
      return new NextResponse('Untrusted audio source',{status:502})
    }
    return NextResponse.redirect(url,{status:307,headers:{'Cache-Control':'public,max-age=600'}})
  } catch {
    return new NextResponse('Invalid audio source',{status:502})
  }
}
