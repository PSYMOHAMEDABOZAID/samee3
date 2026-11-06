'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, Headphones, Search, X } from 'lucide-react'
import { normalizeAdhkarSearch } from '@/lib/adhkar-catalog'

export type AdhkarReaderOption = {
  id: string
  name: string
  availableCount: number
  totalCount: number
  hasComplete?: boolean
}

export default function ReaderPicker({ readers, value, onChange, dark = false }: {
  readers: AdhkarReaderOption[]
  value: string
  onChange: (id: string) => void
  dark?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const dialog = useRef<HTMLDialogElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const selected = readers.find(reader => reader.id === value)
  const searchKey = (text: string) => normalizeAdhkarSearch(text).replace(/\s+/g, '')
  const term = searchKey(search)
  const matches = readers.filter(reader => searchKey(reader.name).includes(term))
  useEffect(() => {
    const element = dialog.current
    if (!element) return
    if (open) {
      setSearch('')
      if (typeof element.showModal === 'function') element.showModal()
      else element.setAttribute('open', '')
      input.current?.focus()
    } else if (element.hasAttribute('open')) {
      if (typeof element.close === 'function') element.close()
      else element.removeAttribute('open')
    }
    return () => {
      if (element.hasAttribute('open')) {
        if (typeof element.close === 'function') element.close()
        else element.removeAttribute('open')
      }
    }
  }, [open])
  const number = (n: number) => n.toLocaleString('ar-EG')
  return <>
    <button type="button" disabled={!readers.length} onClick={() => setOpen(true)} aria-haspopup="dialog" aria-expanded={open}
      aria-label={'اختيار قارئ الأذكار' + (selected ? ': ' + selected.name : '')}
      className={`flex min-h-16 w-full items-center gap-3 rounded-2xl border p-3.5 text-right transition hover:border-[#b49158] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c3a16c] disabled:opacity-50 ${dark ? 'border-white/15 bg-[#203841] text-white' : 'border-[#e4d8c6] bg-white text-[#194b4f]'}`}>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#f3ebdd] text-[#94713e]"><Headphones size={19}/></span>
      <span className="min-w-0 flex-1"><span className="block text-sm font-bold">{selected?.name || 'لا تتوفر تسجيلات لهذا الباب'}</span><span className={`mt-1 block text-[11px] ${dark ? 'text-white/70' : 'text-[#5f716c]'}`}>اضغط لاختيار القارئ أو البحث باسمه</span></span>
      <ChevronDown size={18} className="shrink-0 text-[#aa874e]"/>
    </button>
    <dialog ref={dialog} dir="rtl" aria-label="اختيار قارئ الأذكار" aria-modal="true" onCancel={event => { event.preventDefault(); setOpen(false) }}
      onKeyDown={event => { if (event.key === 'Escape') setOpen(false) }}
      onClick={event => { if (event.target === dialog.current) setOpen(false) }}
      className={`${open ? '' : 'hidden'} fixed inset-0 z-[120] m-auto max-h-[85vh] w-[calc(100%_-_2rem)] max-w-lg overflow-x-hidden overflow-y-auto rounded-[28px] p-0 shadow-2xl backdrop:bg-[#102e30]/60 ${dark ? 'bg-[#162d35] text-white' : 'bg-[#fffdf8] text-[#194b4f]'}`}>
      <div className="border-b border-[#b8a17c]/20 p-5">
        <div className="flex items-center justify-between gap-3"><div><h2 className="font-black">اختر الصوت الأقرب إليك</h2><p className="mt-1 text-xs opacity-60">{number(readers.length)} قارئًا متاحًا · تختلف التسجيلات حسب الباب</p></div><button type="button" onClick={() => setOpen(false)} aria-label="إغلاق اختيار القارئ" className="rounded-full p-2"><X size={20}/></button></div>
        <label className={`mt-4 flex items-center gap-2 rounded-xl border px-3 ${dark ? 'border-white/20' : 'border-[#e5daca] bg-white'}`}><Search size={17} className="opacity-50"/><input ref={input} value={search} onChange={event => setSearch(event.target.value)} aria-label="ابحث عن قارئ" placeholder="ابحث باسم القارئ…" className="min-h-12 min-w-0 flex-1 bg-transparent text-sm outline-none"/></label>
      </div>
      <ul className="max-h-[55dvh] overflow-y-auto overscroll-contain p-2">{matches.map(reader => <li key={reader.id}><button type="button" aria-pressed={reader.id === value} onClick={() => { onChange(reader.id); setOpen(false) }}
        className={`flex min-h-16 w-full items-center gap-3 rounded-2xl px-3 py-3 text-right transition ${reader.id === value ? dark ? 'bg-white/10' : 'bg-[#edf4ef]' : dark ? 'hover:bg-white/5' : 'hover:bg-[#f8f3eb]'}`}>
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${reader.id === value ? 'bg-[#245d4d] text-white' : 'bg-[#b6a080]/15 text-[#ac8b54]'}`}>{reader.id === value ? <Check size={19}/> : <Headphones size={17}/>}</span>
        <span className="min-w-0 flex-1"><span className="block text-sm font-bold">{reader.name}</span><span className="mt-1 block text-[11px] opacity-65">{number(reader.availableCount)} من {number(reader.totalCount)} ذكرًا بصوت منفصل{reader.hasComplete ? ' · تسجيل كامل متاح' : ''}</span></span>
      </button></li>)}</ul>
      {!matches.length && <p role="status" className="px-5 pb-7 text-center text-sm opacity-65">لا يوجد قارئ مطابق. جرّب جزءًا من الاسم.</p>}
    </dialog>
  </>
}
