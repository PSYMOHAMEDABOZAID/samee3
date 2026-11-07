'use client'
import { useEffect } from 'react'
import { buildWidgetSnapshot, loadWidgetSettings, persistSnapshot } from '@/lib/samee3-widgets'

type WidgetWindow = Window & {
  Samee3WidgetsTransport?: { send: (json: string) => void }
  webkit?: { messageHandlers?: { samee3Widgets?: { postMessage: (json: string) => void } } }
}
/** Sync only non-sensitive widget fields. Never send Firebase auth or raw browser storage. */
export default function Samee3WidgetSync() {
  useEffect(() => {
    let last = ''
    const sync = () => {
      if (document.visibilityState === 'hidden') return
      const snapshot = buildWidgetSnapshot(loadWidgetSettings())
      persistSnapshot(snapshot)
      // Skip repeated sends when nothing relevant changed; timestamps aren't content.
      const content = JSON.stringify({ ...snapshot, generatedAt: 0 })
      if (content === last) return
      last = content
      const bridge = window as WidgetWindow
      const payload = JSON.stringify(snapshot)
      try { bridge.Samee3WidgetsTransport?.send(payload) } catch { /* native host not available */ }
      try { bridge.webkit?.messageHandlers?.samee3Widgets?.postMessage(payload) } catch { /* not an iOS host */ }
    }
    const onVisibility = () => { if (document.visibilityState === 'visible') sync() }
    const onStorage = (event: StorageEvent) => {
      if (event.key?.startsWith('samee3_') || event.key === null) sync()
    }
    sync()
    window.addEventListener('focus', sync)
    window.addEventListener('pageshow', sync)
    window.addEventListener('storage', onStorage)
    // Native Android's secure message port may attach AFTER the first snapshot.
    // Force a resend once transport becomes available, even if data is unchanged.
    const onWidgetSettings = () => { last = ''; sync() }
    window.addEventListener('samee3:widget-settings', onWidgetSettings)
    window.addEventListener('samee3:prayer-settings', sync)
    document.addEventListener('visibilitychange', onVisibility)
    const timer = window.setInterval(sync, 60000)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', sync)
      window.removeEventListener('pageshow', sync)
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('samee3:widget-settings', onWidgetSettings)
      window.removeEventListener('samee3:prayer-settings', sync)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])
  return null
}
