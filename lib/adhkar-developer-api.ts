import rawCatalog from '@/public/data/adhkar-audio/v1/catalog.json'
export type AdhkarAudioRecording = {
  url: string; mimeType: string; bytes: number; durationMs: number; sha256: string
  timing: {startMs:number; endMs:number}; contextSection?: string; rightsId?: string; sourcePage?: string
  alignment: {method:string; manuallyReviewed:boolean; textMatchScore?:number; textMatchUnit?:string; textMatchScope?:string; matchedText?:string}
  source: {url:string; sha256:string; startMs:number; endMs:number}
}
export type AdhkarAudioItem = {
  id:string; categoryId:number; itemId:number; category:string; text:string; repeatCount:number; originalAudioId:string
  recordings:Record<string,AdhkarAudioRecording>; variants?:Record<string,Partial<Record<string,AdhkarAudioRecording>>>
}
export type AdhkarAudioReader = {id:string; name:string; sourcePage:string; individualAudioCount:number; sectionAudioCount:number; categoryCount:number; totalCanonicalItems:number; coverage:string; sourceFileCount:number; rightsIds?:string[]}
export type AdhkarSectionRecording = AdhkarAudioRecording & {id:string; readerId:string; title:string; type:string; categoryIds:number[]; sourcePage:string; publisher:string; attributionLevel:string}
type Catalog = {
  schemaVersion:number; datasetVersion:string; title:string; language:string; timeUnit:string; itemCount:number; categoryCount:number; recordingCount:number
  reciters:AdhkarAudioReader[]; categories:{id:number; title:string; itemCount:number}[]; items:AdhkarAudioItem[]
  rights:Record<string,unknown>; textSource:Record<string,unknown>; timingPolicy:string; sectionRecordings:AdhkarSectionRecording[]
  individualAudioFileCount:number; sectionRecordingCount:number; totalAudioFileCount:number
}
// The generated JSON has heterogeneous reader keys. TypeScript infers absent
// keys as optional undefined values; release validation checks the actual map.
export const adhkarAudioCatalog = rawCatalog as unknown as Catalog
export function adhkarApiIndex() {
  const {items:_items,sectionRecordings:_sections,...index} = adhkarAudioCatalog
  return {...index,access:{api:'free',apiKeyRequired:false,accountRequired:false,cors:'*',audioRights:'See rightsId and the original source terms.'},
    endpoints:{index:'/api/adhkar/v1',items:'/api/adhkar/v1/items',simpleItems:'/api/adhkar/v1/items?format=simple&reciter={reciter}',reciters:'/api/adhkar/v1/reciters',sections:'/api/adhkar/v1/sections',sectionTimings:'/api/adhkar/v1/sections/{recording}/timings',timings:'/api/adhkar/v1/timings/{reciter}',catalog:'/data/adhkar-audio/v1/catalog.json',coverage:'/data/adhkar-audio/v1/coverage.json',documentation:'/developers/adhkar',javascriptSdk:'/adhkar-sdk/v1/index.js'}}
}
export function selectAdhkarAudio(item:AdhkarAudioItem,reader:string,section=''):AdhkarAudioRecording|undefined {
  const clip = section ? item.variants?.[reader]?.[section] || item.recordings[reader] : item.recordings[reader]
  if (section && (clip?.contextSection === 'morning' || clip?.contextSection === 'evening') && clip.contextSection !== section) return undefined
  return clip
}
export function filterAdhkarAudio(params:URLSearchParams) {
  const reader=params.get('reciter')||'',section=params.get('section')||''
  if (reader && !adhkarAudioCatalog.reciters.some(r=>r.id===reader)) throw new Error('Unknown reciter')
  if (section && !['morning','evening','sleep','waking'].includes(section)) throw new Error('Invalid section')
  const number=(key:string,fallback:number,maximum:number)=>{
    const raw=params.get(key);if(raw===null)return fallback
    if(!/^\d+$/.test(raw))throw new Error(`Invalid ${key}`)
    const value=Number(raw)
    if(!Number.isSafeInteger(value)||value<(key==='offset'?0:1)||value>maximum)throw new Error(`Invalid ${key}`)
    return value
  }
  const category=number('category',0,10000),itemId=number('item',0,10000),limit=number('limit',50,100),offset=number('offset',0,100000)
  const all=adhkarAudioCatalog.items.filter(item=>(!category||item.categoryId===category)&&(!itemId||item.itemId===itemId)&&(!reader||params.get('includeMissing')==='1'||Boolean(selectAdhkarAudio(item,reader,section))))
  const items=all.slice(offset,offset+limit).map(item=>{
    const recordings:Record<string,AdhkarAudioRecording>={}
    for(const id of reader?[reader]:Object.keys(item.recordings)){const clip=selectAdhkarAudio(item,id,section);if(clip)recordings[id]=clip}
    const variants=reader?item.variants?.[reader]?{[reader]:item.variants[reader]}:undefined:item.variants
    return {...item,recordings,variants}
  })
  return {schemaVersion:1,datasetVersion:adhkarAudioCatalog.datasetVersion,total:all.length,offset,limit,nextOffset:offset+items.length<all.length?offset+items.length:null,items}
}
export function adhkarReaderTimings(reader:string,category?:number) {
  if(!adhkarAudioCatalog.reciters.some(r=>r.id===reader))return null
  const items=adhkarAudioCatalog.items.filter(i=>!category||i.categoryId===category)
  const timing=(item:AdhkarAudioItem,clip:AdhkarAudioRecording)=>({itemId:item.id,categoryId:item.categoryId,dhikrId:item.itemId,url:clip.url,...clip.timing,source:clip.source,alignment:clip.alignment,...(clip.contextSection?{contextSection:clip.contextSection}:{}),...(clip.rightsId?{rightsId:clip.rightsId}:{})})
  return {schemaVersion:1,datasetVersion:adhkarAudioCatalog.datasetVersion,reciter:reader,timeUnit:'milliseconds',
    items:items.filter(i=>i.recordings[reader]).map(i=>timing(i,i.recordings[reader])),
    variants:items.flatMap(i=>Object.entries(i.variants?.[reader]||{}).flatMap(([contextSection,clip])=>clip?[{...timing(i,clip),contextSection}]:[])),
    sections:adhkarAudioCatalog.sectionRecordings.filter(s=>s.readerId===reader&&(!category||s.categoryIds.includes(category)))}
}
export function filterAdhkarSections(params:URLSearchParams) {
  const reader=params.get('reciter')||'',type=params.get('type')||'',category=params.get('category')||''
  if(reader&&!adhkarAudioCatalog.reciters.some(r=>r.id===reader))throw new Error('Unknown reciter')
  if(type&&!['morning','evening','sleep','waking','day-and-night','chapter'].includes(type))throw new Error('Invalid type')
  if(category&&!/^[1-9]\d{0,3}$/.test(category))throw new Error('Invalid category')
  const recordings=adhkarAudioCatalog.sectionRecordings.filter(s=>(!reader||s.readerId===reader)&&(!type||s.type===type)&&(!category||s.categoryIds.includes(Number(category))))
  return {schemaVersion:1,datasetVersion:adhkarAudioCatalog.datasetVersion,total:recordings.length,recordings}
}

/** A compact response for applications; the original v1 response stays unchanged. */
export function adhkarPublicOrigin(value?: string) {
  try {
    const url = new URL(value || 'https://samee3.vercel.app')
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    if ((url.protocol === 'https:' || local && url.protocol === 'http:') && !url.username && !url.password) return url.origin
  } catch { /* A bad public-origin setting must not expose an internal server URL. */ }
  return 'https://samee3.vercel.app'
}
export function simpleAdhkarAudio(params: URLSearchParams, origin = 'https://samee3.vercel.app') {
  const reader = params.get('reciter') || ''
  if (!reader) throw new Error('reciter is required for format=simple')
  const result = filterAdhkarAudio(params)
  const reciter = adhkarAudioCatalog.reciters.find(row => row.id === reader)!
  return { ...result, reciter: { id: reciter.id, name: reciter.name }, timeUnit: 'milliseconds',
    access: { api: 'free', apiKeyRequired: false, accountRequired: false },
    rights: adhkarAudioCatalog.rights,
    items: result.items.map(item => {
      const clip = item.recordings[reader]
      return { id: item.id, categoryId: item.categoryId, itemId: item.itemId, category: item.category,
        text: item.text, repeatCount: item.repeatCount,
        audioUrl: clip ? new URL(clip.url, origin).href : null,
        startMs: clip?.timing.startMs ?? null, endMs: clip?.timing.endMs ?? null,
        durationMs: clip?.durationMs ?? null, rightsId: clip?.rightsId ?? null,
        sourcePage: clip?.sourcePage || reciter.sourcePage,
        sourceTiming: clip ? { startMs: clip.source.startMs, endMs: clip.source.endMs } : null,
        alignment: clip?.alignment ?? null,
      }
    }),
  }
}

/** Timings are matched to the SAME source file/hash, never borrowed from another performance. */
export function adhkarSectionTimings(id: string) {
  const recording = adhkarAudioCatalog.sectionRecordings.find(row => row.id === id)
  if (!recording) return null
  const seen = new Set<string>()
  const rows: { id: string; categoryId: number; itemId: number; category: string; text: string; repeatCount: number; startMs: number; endMs: number; alignment: AdhkarAudioRecording['alignment'] }[] = []
  for (const item of adhkarAudioCatalog.items) {
    const clips = [item.recordings[recording.readerId], ...Object.values(item.variants?.[recording.readerId] || {})]
    for (const clip of clips) {
      if (!clip || clip.source.url !== recording.source.url || clip.source.sha256 !== recording.source.sha256) continue
      const startMs = clip.source.startMs - recording.source.startMs
      const endMs = Math.min(recording.durationMs, clip.source.endMs - recording.source.startMs)
      if (startMs < 0 || !Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) continue
      const key = `${item.id}:${startMs}:${endMs}`
      if (seen.has(key)) continue
      seen.add(key)
      rows.push({ id: item.id, categoryId: item.categoryId, itemId: item.itemId, category: item.category,
        text: clip.alignment.matchedText || item.text, repeatCount: item.repeatCount,
        startMs, endMs, alignment: clip.alignment })
    }
  }
  rows.sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs)
  return { schemaVersion: 1, datasetVersion: adhkarAudioCatalog.datasetVersion, timeUnit: 'milliseconds',
    recording: { id: recording.id, title: recording.title, readerId: recording.readerId, url: recording.url, durationMs: recording.durationMs, rightsId: recording.rightsId, sourcePage: recording.sourcePage },
    total: rows.length, coverage: rows.length ? 'published-segments-only' : 'no-published-segments',
    timingPolicy: 'Only published alignments from this exact recording are included. Gaps are left unlabelled; no timings are estimated for missing dhikr.',
    items: rows.map((row, index) => ({ ...row, number: index + 1 })),
  }
}
