'use client'

import { useCallback, useEffect, useState } from 'react'

export type ReminderSettings = {
  quran: boolean; adhkar: boolean; hadith: boolean; prayer: boolean; audio: boolean; library: boolean
  fullAdhan: boolean; adhanVoice: string; fajrVoice: string; adhanVolume: number
  quranTime: string; morningTime: string; eveningTime: string; audioTime: string; libraryTime: string
  hadithHours: number; hadithStart: number; hadithEnd: number
  timezone: string; latitude?: number; longitude?: number; city: string; method: number; school: number; prayers: string[]
}
export type AndroidStatus = {
  platform: 'android'; bridgeVersion: number; versionName: string; versionCode: number; sdk: number
  notificationsAllowed: boolean; exactAlarmsAllowed: boolean
  settings: ReminderSettings; adhanDownloads?: Record<string, 'ready' | 'missing' | 'downloading' | 'error'>; adhanPlaying?: boolean; next: Record<string, number>; calendarUntil: string; calendarError: string
}
declare global {
  interface Window {
    Samee3Android?: { request: (type: string, payload?: unknown) => Promise<AndroidStatus> }
    __samee3AndroidCleanup?: () => void
  }
}

export const DEFAULT_REMINDERS: ReminderSettings = {
  quran: false, adhkar: false, hadith: false, prayer: false, audio: false, library: false,
  fullAdhan: true, adhanVoice: 'ali-mulla', fajrVoice: 'makkah-fajr', adhanVolume: 70,
  quranTime: '20:00', morningTime: '07:00', eveningTime: '17:00', audioTime: '13:00', libraryTime: '19:00',
  hadithHours: 3, hadithStart: 8, hadithEnd: 22, timezone: 'Asia/Muscat', city: 'الموقع المختار',
  method: 8, school: 0, prayers: ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'],
}

export function nativeRequest(type: string, payload?: unknown): Promise<AndroidStatus> {
  if (typeof window === 'undefined' || !window.Samee3Android) return Promise.reject(new Error('هذه الميزة تحتاج نسخة أندرويد المحدثة.'))
  return window.Samee3Android.request(type, payload)
}

export function useAndroidApp() {
  const [status, setStatus] = useState<AndroidStatus | null>(null)
  const [connecting, setConnecting] = useState(true)
  const [nativeBrowser, setNativeBrowser] = useState(false)
  const refresh = useCallback(async () => {
    if (!window.Samee3Android) return null
    const value = await nativeRequest('status')
    if (value.platform !== 'android' || value.bridgeVersion !== 1) throw new Error('حدّث تطبيق أندرويد لإعداد الإشعارات.')
    setStatus(value); setConnecting(false); return value
  }, [])
  useEffect(() => {
    let disposed = false
    const native = /SAMEE3(?:Android|Native)\//.test(navigator.userAgent)
    setNativeBrowser(native)
    if (!native && !window.Samee3Android) setConnecting(false)
    const load = () => { if (!disposed) void refresh().catch(() => { if (!disposed) setConnecting(false) }) }
    const visible = () => { if (document.visibilityState === 'visible') load() }
    window.addEventListener('samee3:android-ready', load)
    window.addEventListener('focus', load)
    document.addEventListener('visibilitychange', visible)
    const timeout = window.setTimeout(() => { if (!disposed) setConnecting(false) }, 3500)
    load()
    return () => { disposed = true; clearTimeout(timeout); window.removeEventListener('samee3:android-ready', load); window.removeEventListener('focus', load); document.removeEventListener('visibilitychange', visible) }
  }, [refresh])
  return { status, setStatus, connecting, nativeBrowser, refresh }
}
