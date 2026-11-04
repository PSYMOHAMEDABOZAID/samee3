'use client'

import { timeoutSignal } from '@/lib/abort-signals'

import { useEffect, useState } from 'react'
import { BellRing, Download, RefreshCw } from 'lucide-react'
import { auth } from '@/lib/firebase'
type Stats = { installations: { total: number; platforms: Record<string, number> }; subscriptions: number; pushConfigured: boolean; scheduler: { lastCompletedAt?: number; lastRunAt?: number; failed?: number } | null }
export default function AppStatistics() {
  const [stats, setStats] = useState<Stats | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const load = async () => {
    if (!auth.currentUser) return
    setBusy(true); setError('')
    try {
      const token = await auth.currentUser.getIdToken()
      const response = await fetch('/api/admin/app-stats', { cache: 'no-store', headers: { Authorization: `Bearer ${token}` }, signal: timeoutSignal(15000) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'تعذر تحديث الإحصاءات.')
      setStats(data)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'تعذر تحديث الإحصاءات.') }
    finally { setBusy(false) }
  }
  useEffect(() => { void load() }, [])
  const last = stats?.scheduler?.lastCompletedAt || 0
  return <section className="rounded-3xl border border-[#dfd2bb] bg-white p-5 shadow-sm"><div className="flex items-center justify-between gap-3"><h3 className="flex items-center gap-2 font-bold text-[#194f43]"><Download size={20}/>تثبيتات التطبيق وإشعارات الويب</h3><button type="button" onClick={() => void load()} disabled={busy} className="rounded-xl border p-2" aria-label="تحديث إحصاءات التطبيق"><RefreshCw size={17} className={busy ? 'animate-spin' : ''}/></button></div>
    {error && <p role="alert" className="mt-3 text-sm text-amber-800">{error}</p>}
    {stats && <><div className="mt-5 grid gap-3 sm:grid-cols-2"><div className="rounded-2xl bg-emerald-50 p-4"><p className="text-xs">التثبيتات المرصودة</p><p className="mt-2 text-3xl font-black text-[#194f43]">{stats.installations.total.toLocaleString('ar-EG')}</p><div className="mt-3 flex flex-wrap gap-3 text-xs">{Object.entries({ ios: 'آيفون وآيباد', android: 'أندرويد', desktop: 'الكمبيوتر', tv: 'الشاشات' }).map(([key, name]) => <span key={key}>{name}: {(stats.installations.platforms[key] || 0).toLocaleString('ar-EG')}</span>)}</div></div><div className="rounded-2xl bg-[#faf4e9] p-4"><p className="flex items-center gap-2 text-xs"><BellRing size={15}/>اشتراكات إشعارات الويب</p><p className="mt-2 text-3xl font-black text-[#194f43]">{stats.subscriptions.toLocaleString('ar-EG')}</p><p className="mt-3 text-xs leading-6">{!stats.pushConfigured ? 'إعداد مفاتيح الإرسال غير مكتمل.' : !last ? 'المفاتيح جاهزة؛ لم يعمل المجدول بعد.' : Date.now() - last > 5 * 60000 ? 'المجدول متأخر. راجع تشغيل الخدمة المجدولة.' : 'المجدول يعمل.'}{last > 0 && ` آخر تشغيل: ${new Intl.DateTimeFormat('ar', { dateStyle: 'short', timeStyle: 'short' }).format(last)}`}</p></div></div><p className="mt-4 text-xs leading-6 text-slate-500">يبدأ العد بعد هذا التحديث عند التثبيت أو أول فتح للنسخة المثبتة. يُحسب كل تثبيت مرة واحدة في هذا المتصفح؛ إعادة الزيارة لا تزيد العدد. هذا عدد نسخ مرصودة وليس عدد أشخاص فريدين أو إثبات اكتمال تنزيل APK.</p></>}
  </section>
}
