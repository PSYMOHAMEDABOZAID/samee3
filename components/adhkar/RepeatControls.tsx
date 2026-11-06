'use client'

import type { AdhkarListeningMode } from '@/lib/adhkar-listening'

export default function RepeatControls({ mode, onMode, value, onValue, onBlur, dark }: {
  mode: AdhkarListeningMode
  onMode: (mode: AdhkarListeningMode) => void
  value: string
  onValue: (value: string) => void
  onBlur: () => void
  dark: boolean
}) {
  return <fieldset className="my-4">
    <legend className="text-xs font-bold">تكرار الاستماع لكل ذكر</legend>
    <div className="mt-2 grid grid-cols-3 gap-2">
      {([['once', 'مرة واحدة'], ['remaining', 'حسب العدّاد'], ['custom', 'عدد أختاره']] as const).map(([key, label]) =>
        <button key={key} type="button" aria-pressed={mode === key} onClick={() => onMode(key)}
          className={`min-h-11 rounded-xl border px-2 text-xs font-bold ${mode === key ? 'border-[#bca06c] bg-[#f3ead8] text-[#72552e]' : dark ? 'border-white/15 text-white/70' : 'border-[#e6ded2] text-[#667a75]'}`}>{label}</button>)}
    </div>
    {mode === 'custom' && <div className="mt-3 flex flex-wrap items-center gap-2">
      <label className="text-xs">عدد مرات الاستماع
        <input aria-label="عدد مرات تكرار الاستماع" type="number" min={1} max={1000} step={1} inputMode="numeric" value={value}
          onChange={event => onValue(event.target.value)} onBlur={onBlur}
          className={`mr-2 min-h-11 w-24 rounded-xl border px-3 text-center ${dark ? 'border-white/20 bg-[#13232c]' : 'border-[#dfd2bc] bg-white'}`}/>
      </label>
      {[3, 7, 10, 33, 100].map(n => <button key={n} type="button" onClick={() => onValue(String(n))} className="min-h-10 rounded-xl bg-[#bca06c]/15 px-3 text-xs font-bold">{n.toLocaleString('ar-EG')}</button>)}
    </div>}
    <p className="mt-2 text-[11px] leading-6 opacity-65">اختيارك يحدد مرات الاستماع والترديد. العدد المطلوب مع الذكر يظل كما هو، ولا ينقص عدّادك عن الصفر.</p>
  </fieldset>
}
