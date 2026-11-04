'use client'
import { useEffect, useState } from 'react'
import { Download } from 'lucide-react'
import { installedWebApp, iosDevice } from '@/lib/web-push-client'
type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }
export default function WebInstallButton() {
  const [event, setEvent] = useState<InstallEvent | null>(null), [installed, setInstalled] = useState(false), [message, setMessage] = useState('')
  useEffect(() => {
    setInstalled(installedWebApp())
    const capture = (value: Event) => { value.preventDefault(); setEvent(value as InstallEvent) }
    const done = () => { setInstalled(true); setEvent(null); setMessage('تم تثبيت سميع. افتحه من الأيقونة وفعّل الإشعارات.') }
    window.addEventListener('beforeinstallprompt', capture); window.addEventListener('appinstalled', done)
    return () => { window.removeEventListener('beforeinstallprompt', capture); window.removeEventListener('appinstalled', done) }
  }, [])
  const install = async () => {
    if (event) { await event.prompt(); await event.userChoice; setEvent(null) }
    else setMessage(iosDevice() ? 'في Safari اضغط مشاركة ← إضافة إلى الشاشة الرئيسية، ثم افتح سميع من الأيقونة.' : 'من قائمة المتصفح اختر «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية».')
  }
  return <div><button type="button" onClick={() => void install()} disabled={installed} className="flex min-h-11 items-center gap-2 rounded-xl bg-[#194f43] px-4 py-3 text-xs font-bold text-white disabled:opacity-60"><Download size={16}/>{installed ? 'سميع مثبت على هذا الجهاز' : 'تثبيت سميع كتطبيق ويب'}</button>{message && <p role="status" className="mt-2 text-xs leading-6 text-slate-600">{message}</p>}</div>
}
