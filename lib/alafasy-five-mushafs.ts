import catalog from './alafasy-riwayat-manifest.json'

export type AlafasyRiwaya = { id: number; name: string }
export type AlafasyMoshaf = {
  id: number
  name: string
  server: string
  surah_total: number
  rewaya_id: number
  moshaf_type: number
  surah_list: string
}
export type AlafasyReciter = {
  id: number
  name: string
  moshaf: AlafasyMoshaf[]
}
type VerifiedEntry = {
  key: string
  id: number
  riwaya: string
  server: string
  surah_list: string
  surah_total: number
  verified?: boolean
}
const COMPLETE_LIST = Array.from({length:114},(_,i)=>i+1).join(',')
const RELEASES = (catalog.entries as VerifiedEntry[]).filter((item) =>
  item && item.verified === true &&
  typeof item.key === 'string' &&
  Number.isSafeInteger(item.id) &&
  typeof item.riwaya === 'string' &&
  typeof item.server === 'string' &&
  /^https:\/\/[\w.-]+\.mp3quran\.net\//.test(item.server) &&
  item.surah_total === 114 &&
  item.surah_list === COMPLETE_LIST
)
function normalize(input: string): string {
  return input
    .toLowerCase()
    .replace(/[\u064b-\u065f\u0670\u0640]/g,'')
    .replace(/[أإآ]/g,'ا')
    .replace(/ى/g,'ي')
    .replace(/ة/g,'ه')
    .replace(/[–—_-]/g,' ')
    .replace(/\s+/g,' ')
    .trim()
}
function riwayaMatch(a:string,b:string):boolean {
  return normalize(a)===normalize(b)
}
export function extendRiwayatWithAlafasy<T extends AlafasyRiwaya>(existing:T[]): AlafasyRiwaya[] {
  const result: AlafasyRiwaya[] = [...existing]
  // Synthetic selectors only for riwayat missing from MP3Quran's riwayat catalog.
  let id=930000
  for (const item of RELEASES) {
    if (result.some(r=>riwayaMatch(r.name,item.riwaya))) continue
    result.push({id:++id,name:item.riwaya})
  }
  return result
}
export function alafasyFullMushafsForRiwaya(riwaya:AlafasyRiwaya):AlafasyReciter[] {
  return RELEASES.filter(item=>riwayaMatch(item.riwaya,riwaya.name))
    .map(item=>({
      id:item.id,
      name:`مشاري راشد العفاسي — مصحف الروايات — ${item.riwaya}`,
      moshaf:[{
        id:item.id,
        name:`مصحف الروايات — ${item.riwaya}`,
        server:item.server.replace(/\/?$/,'/'),
        surah_total:114,
        rewaya_id:riwaya.id,
        moshaf_type:0,
        surah_list:COMPLETE_LIST,
      }]
    }))
}
