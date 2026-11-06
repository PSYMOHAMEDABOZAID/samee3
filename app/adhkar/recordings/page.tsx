'use client'
import { Suspense, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { ArrowRight, Download, Headphones, Pause, Play, Search } from 'lucide-react'
import { appAudio, useAppAudio } from '@/lib/app-audio'
import { localAdhkarReaders, localAdhkarSections, type LocalAdhkarSection } from '@/lib/adhkar-local-audio'
import { downloadAdhkarForOffline } from '@/lib/adhkar-offline'
const readers=localAdhkarReaders(),recordings=localAdhkarSections()
function timeLabel(ms:number){const seconds=Math.round(ms/1000);return `${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`}
function RecordingsContent(){
  const search=useSearchParams(),requested=search.get('reciter')||''
  const [reader,setReader]=useState(readers.some(r=>r.id===requested&&r.sectionAudioCount>0)?requested:'')
  const [query,setQuery]=useState(''),[limit,setLimit]=useState(24),[busy,setBusy]=useState(''),[progress,setProgress]=useState(0),[message,setMessage]=useState('')
  const controller=useRef<AbortController|null>(null),playback=useAppAudio()
  const current=playback.scope==='adhkar'?playback.queue[playback.index]:undefined
  const normalize=(s:string)=>s.normalize('NFKC').replace(/[\u064b-\u065f\u0670\u0640]/g,'').replace(/[أإآٱ]/g,'ا')
  const filtered=recordings.filter(s=>(!reader||s.readerId===reader)&&normalize(s.title).includes(normalize(query.trim())))
  useEffect(()=>{setLimit(24)},[query,reader])
  useEffect(()=>{setReader(readers.some(r=>r.id===requested&&r.sectionAudioCount>0)?requested:'')},[requested])
  useEffect(()=>()=>controller.current?.abort(),[])
  const play=(clip:LocalAdhkarSection)=>{
    if(current?.url===clip.url){appAudio.toggle();return}
    setMessage('')
    appAudio.start({scope:'adhkar',contextKey:'adhkar-recordings',readerId:clip.readerId,href:'/adhkar/recordings'+(reader?'?reciter='+encodeURIComponent(reader):''),index:filtered.findIndex(s=>s.id===clip.id),queue:filtered.map(s=>({url:s.url,title:s.title,subtitle:readers.find(r=>r.id===s.readerId)?.name||''}))})
  }
  const save=async(clip:LocalAdhkarSection)=>{
    if(controller.current)return
    const abort=new AbortController();controller.current=abort;setBusy(clip.id);setProgress(0);setMessage('')
    try{await downloadAdhkarForOffline(clip.url,abort.signal,(loaded,total)=>{if(total)setProgress(Math.min(99,Math.round(loaded/total*100)))});setProgress(100);setMessage('تم حفظ التسجيل على هذا الجهاز للتشغيل دون إنترنت.')}
    catch(error){setMessage(abort.signal.aborted?'تم إيقاف التنزيل.':error instanceof Error&&error.name==='QuotaExceededError'?'مساحة الحفظ على الجهاز غير كافية. أفرغ بعض المساحة وأعد المحاولة.':'تعذر تنزيل التسجيل. تحقق من الاتصال وأعد المحاولة.')}
    finally{controller.current=null;setBusy('')}
  }
  return <main dir="rtl" className="min-h-screen bg-[#f7f5f0] px-4 pb-40 pt-6 text-[#213d3f]"><div className="mx-auto max-w-5xl space-y-5">
    <Link href="/adhkar" className="inline-flex items-center gap-2 text-sm font-bold"><ArrowRight size={18}/>فهرس الأذكار</Link>
    <header className="rounded-3xl bg-[#194f43] p-6 text-white"><Headphones className="mb-3 text-[#e5cfaa]" size={28}/><h1 className="text-2xl font-extrabold">التسجيلات الكاملة للأذكار</h1><p className="mt-3 text-sm leading-8">استمع إلى تسجيلات القراء كاملة، أو احفظها على جهازك دون إنترنت. الملفات المنفصلة لكل ذكر متاحة من فهرس الأذكار.</p></header>
    <div className="grid gap-3 sm:grid-cols-2"><select aria-label="القارئ" value={reader} onChange={e=>setReader(e.target.value)} className="min-h-12 rounded-2xl border border-[#dfd4be] bg-white px-4 text-sm"><option value="">كل القراء</option>{readers.filter(r=>r.sectionAudioCount>0).map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select><label className="flex items-center gap-2 rounded-2xl border border-[#dfd4be] bg-white px-4"><Search size={18}/><input aria-label="ابحث في التسجيلات" value={query} onChange={e=>setQuery(e.target.value)} placeholder="ابحث عن الذكر أو الباب" className="min-h-12 min-w-0 flex-1 bg-transparent text-sm outline-none"/></label></div>
    <p className="text-sm text-slate-600">{filtered.length.toLocaleString('ar')} تسجيلًا متاحًا {filtered.length>0&&<button type="button" onClick={()=>play(filtered[0])} className="mr-3 rounded-xl bg-[#194f43] px-4 py-2 font-bold text-white">تشغيل القائمة</button>}</p>
    {message&&<p role="status" className="rounded-2xl border border-[#dfd4be] bg-white p-4 text-sm leading-7">{message}</p>}
    {busy&&<div role="status" className="flex items-center justify-between rounded-2xl bg-white p-4 text-sm"><span>جارٍ الحفظ · {progress.toLocaleString('ar')}٪</span><button type="button" onClick={()=>controller.current?.abort()} className="font-bold text-red-700">إيقاف التنزيل</button></div>}
    <div className="grid gap-3 sm:grid-cols-2">{filtered.slice(0,limit).map(clip=>{const active=current?.url===clip.url&&playback.playing;return <article key={clip.id} className="rounded-3xl border border-[#dfd4be] bg-white p-5 shadow-sm"><p className="text-xs text-slate-500">{readers.find(r=>r.id===clip.readerId)?.name}</p><h2 className="mt-2 font-bold leading-8">{clip.title}</h2><p dir="ltr" className="mt-2 text-right text-xs text-slate-500">{timeLabel(clip.durationMs)}</p><div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={()=>play(clip)} aria-label={(active?'إيقاف مؤقت: ':'تشغيل: ')+clip.title} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#194f43] px-4 text-sm font-bold text-white">{active?<Pause size={16}/>:<Play size={16}/>}{active?'إيقاف مؤقت':'استماع'}</button><button type="button" disabled={Boolean(busy)} onClick={()=>void save(clip)} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#dfd4be] px-3 text-xs font-bold disabled:opacity-50"><Download size={15}/>حفظ دون نت</button><a download href={clip.url} className="inline-flex min-h-11 items-center rounded-xl px-2 text-xs underline">تحميل MP3</a></div><a href={clip.sourcePage} target="_blank" rel="noreferrer" className="mt-3 inline-block text-xs text-slate-500 underline">مصدر التسجيل</a></article>})}</div>
    {!filtered.length&&<p className="rounded-2xl bg-white p-5 text-sm">لا توجد تسجيلات كاملة مطابقة. يمكنك فتح فهرس الأذكار للاستماع إلى الملفات الفردية المتاحة.</p>}
    {filtered.length>limit&&<button type="button" onClick={()=>setLimit(old=>old+24)} className="min-h-12 w-full rounded-2xl border border-[#dfd4be] bg-white text-sm font-bold">عرض تسجيلات أخرى</button>}
    <Link href="/developers/adhkar" className="inline-block text-sm font-bold underline">الصوتيات والتوقيتات للمطورين وشروط المصادر</Link>
  </div></main>
}
export default function AdhkarRecordingsPage(){return <Suspense fallback={<div dir="rtl" className="p-8 text-center">جارٍ فتح التسجيلات…</div>}><RecordingsContent/></Suspense>}
