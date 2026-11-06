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
  return {...index,endpoints:{index:'/api/adhkar/v1',items:'/api/adhkar/v1/items',reciters:'/api/adhkar/v1/reciters',sections:'/api/adhkar/v1/sections',timings:'/api/adhkar/v1/timings/{reciter}',catalog:'/data/adhkar-audio/v1/catalog.json',coverage:'/data/adhkar-audio/v1/coverage.json',documentation:'/developers/adhkar'}}
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
