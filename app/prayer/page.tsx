'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useAndroidApp } from '@/lib/android-native'
import PrayerPreferences from '@/components/PrayerPreferences'
import { readWebSettings } from '@/lib/web-push-client'
import { apiPrayerDate, fetchPrayerDay, locationDate, nextPrayerFromDays, parsePrayerDay, qiblaBearing, shiftPrayerDate, type PrayerDay } from '@/lib/prayer-times'
import {
  ChevronRight,
  MapPin,
  Compass,
  Clock,
  Bell,
  Loader2,
  RefreshCw,
  Navigation,
  LocateFixed,
  CalendarDays,
  Sunrise,
} from 'lucide-react'

type Timings = {
  Fajr: string
  Sunrise: string
  Dhuhr: string
  Asr: string
  Maghrib: string
  Isha: string
  [key: string]: string
}

type PrayerItem = {
  id: string
  name: string
  time: string
}

type NextPrayer = PrayerItem & {
  isTomorrow?: boolean
}

type QiblaData = {
  direction: number
  directionRounded: number
  compassPoint: string
}

const FALLBACK_LOCATION = {
  latitude: 23.588,
  longitude: 58.3829,
  city: 'مسقط، عُمان',
}

const CALCULATION_METHOD = 8 // Gulf Region

const prayerList: Omit<PrayerItem, 'time'>[] = [
  { id: 'Fajr', name: 'الفجر' },
  { id: 'Sunrise', name: 'الشروق' },
  { id: 'Dhuhr', name: 'الظهر' },
  { id: 'Asr', name: 'العصر' },
  { id: 'Maghrib', name: 'المغرب' },
  { id: 'Isha', name: 'العشاء' },
]

function arabicDigits(value: string | number) {
  return String(value).replace(/\d/g, (digit) => '٠١٢٣٤٥٦٧٨٩'[Number(digit)])
}

function stripExtraTimeText(value: string) {
  return String(value || '').replace(/\s*\([^)]*\)/g, '').trim()
}

function parseTime(value: string) {
  const clean = stripExtraTimeText(value)
  const [hours = '0', minutes = '0'] = clean.split(':')
  return Number(hours) * 60 + Number(minutes)
}

function formatTime(timeStr: string) {
  const clean = stripExtraTimeText(timeStr)
  if (!clean) return ''

  const [hourText, minuteText] = clean.split(':')
  let hour = Number(hourText)
  const minute = minuteText || '00'
  const period = hour >= 12 ? 'م' : 'ص'

  hour %= 12
  if (hour === 0) hour = 12

  return `${arabicDigits(hour)}:${arabicDigits(minute)} ${period}`
}

function normalizeAngle(angle: number) {
  return ((angle % 360) + 360) % 360
}

function directionName(degrees: number) {
  const directions = ['شمال', 'شمال شرق', 'شرق', 'جنوب شرق', 'جنوب', 'جنوب غرب', 'غرب', 'شمال غرب']
  const index = Math.round(normalizeAngle(degrees) / 45) % 8
  return directions[index]
}

function formatCountdown(totalSeconds: number) {
  const safe = Math.max(0, totalSeconds)
  const hours = Math.floor(safe / 3600)
  const minutes = Math.floor((safe % 3600) / 60)
  const seconds = safe % 60

  return `${arabicDigits(String(hours).padStart(2, '0'))}:${arabicDigits(
    String(minutes).padStart(2, '0')
  )}:${arabicDigits(String(seconds).padStart(2, '0'))}`
}

export default function PrayerPage() {
  const { status: android } = useAndroidApp()
  const calculation = useRef({ method: CALCULATION_METHOD, school: 0, timezone: '' })
  const [days, setDays] = useState<PrayerDay[]>([])
  const [now, setNow] = useState(() => new Date())
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [offline, setOffline] = useState(false)
  const [locationName, setLocationName] = useState(FALLBACK_LOCATION.city)
  const [coordinates, setCoordinates] = useState({ latitude: FALLBACK_LOCATION.latitude, longitude: FALLBACK_LOCATION.longitude })
  const [deviceHeading, setDeviceHeading] = useState<number | null>(null)
  const [compassEnabled, setCompassEnabled] = useState(false)
  const [compassPermissionState, setCompassPermissionState] = useState('')
  const request = useRef(0)
  const locationRequest = useRef(0)
  const controllerRef = useRef<AbortController | null>(null)
  const lastRefresh = useRef('')
  const current = useRef({ coordinates, locationName, days })
  current.current = { coordinates, locationName, days }
  const activeDay = days.find((day) => day.date === locationDate(now, day.timezone))
  const timings = activeDay?.timings || null
  const hijriDate = activeDay?.hijri || ''
  const gregorianDate = activeDay?.gregorian || ''
  const upcoming = useMemo(() => nextPrayerFromDays(days, now), [days, now])
  const nextPrayer: NextPrayer = upcoming || { id: '', name: 'المواقيت غير متاحة', time: '' }
  const countdown = upcoming ? Math.max(0, Math.ceil((upcoming.at - now.getTime()) / 1000)) : 0
  const currentPrayerItems = timings ? prayerList.map((p) => ({ ...p, time: timings[p.id] })) : []
  const qibla = useMemo(() => {
    const direction = qiblaBearing(coordinates.latitude, coordinates.longitude)
    return { direction, directionRounded: Math.round(direction * 10) / 10, compassPoint: directionName(direction) }
  }, [coordinates])
  const qiblaLoading = false, qiblaError = ''

  const fetchTimings = useCallback(async (lat: number, lng: number, city = 'موقعك الحالي') => {
    const id = ++request.current
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    setRefreshing(true); setError('')
    const query = new URLSearchParams({ latitude: String(lat), longitude: String(lng), method: String(calculation.current.method), school: String(calculation.current.school) })
    if (calculation.current.timezone) query.set('timezone', calculation.current.timezone)
    const fetchDay = (date?: string) => fetchPrayerDay(
      `/api/prayer-times?${query}${date ? '&date=' + date : ''}`,
      controller.signal,
    )
    try {
      if (navigator.onLine === false) throw new Error('أنت دون إنترنت. يُعرض جدول الموقع المحفوظ إذا كان صالحًا لهذا اليوم.')
      let today = await fetchDay()
      const actualDate = locationDate(new Date(), today.timezone)
      if (today.date !== actualDate) today = await fetchDay(actualDate)
      // Display today's successful result immediately; later days cannot hide it.
      if (id === request.current && !controller.signal.aborted) { setDays([today]); setCoordinates({ latitude: lat, longitude: lng }); setLocationName(city); setLoading(false) }
      const future = await Promise.allSettled(Array.from({ length: 6 }, (_, i) => fetchDay(shiftPrayerDate(today.date, i + 1))))
      if (id !== request.current || controller.signal.aborted) return
      const next = [today, ...future.flatMap(result => result.status === 'fulfilled' ? [result.value] : [])]
      setDays(next); setCoordinates({ latitude: lat, longitude: lng }); setLocationName(city)
      lastRefresh.current = actualDate
      try { localStorage.setItem('samee3_prayer_days_v1', JSON.stringify({ days: next, latitude: lat, longitude: lng, city, method: calculation.current.method, school: calculation.current.school, timezone: calculation.current.timezone })) } catch {}
      if (!next.some(day => day.date === shiftPrayerDate(today.date, 1))) setError('مواقيت اليوم جاهزة؛ تعذر تحديث فجر الغد. أعد التحديث عند توفر الاتصال.')
    } catch (cause) {
      if (id === request.current) setError(cause instanceof Error && cause.name !== 'AbortError' ? cause.message : 'انتهت مهلة تحديث المواقيت. أعد المحاولة.')
    } finally {
      if (id === request.current) { setLoading(false); setRefreshing(false) }
    }
  }, [])

  const loadCurrentLocation = useCallback(() => {
    const id = ++locationRequest.current
    setError('')
    if (navigator.onLine === false && current.current.days.length) { setLoading(false); return }
    setLoading(true)
    if (!navigator.geolocation) { void fetchTimings(FALLBACK_LOCATION.latitude, FALLBACK_LOCATION.longitude, FALLBACK_LOCATION.city); return }
    navigator.geolocation.getCurrentPosition((position) => {
      if (id !== locationRequest.current) return
      void fetchTimings(position.coords.latitude, position.coords.longitude)
    }, () => {
      if (id !== locationRequest.current) return
      const previous = current.current
      if (previous.days.length || previous.locationName !== FALLBACK_LOCATION.city) void fetchTimings(previous.coordinates.latitude, previous.coordinates.longitude, previous.locationName)
      else { setError('لم يُسمح بتحديد الموقع. تُعرض مسقط كموقع افتراضي؛ اختر موقعك من إعدادات المواقيت.'); void fetchTimings(FALLBACK_LOCATION.latitude, FALLBACK_LOCATION.longitude, FALLBACK_LOCATION.city) }
    }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 })
  }, [fetchTimings])

  useEffect(() => {
    const preferences = readWebSettings()
    calculation.current = { method: preferences.method, school: preferences.school, timezone: preferences.timezone }
    let hasSelectedLocation = false
    if (preferences.latitude !== null && preferences.longitude !== null) {
      hasSelectedLocation = true
      current.current = { ...current.current, coordinates: { latitude: preferences.latitude, longitude: preferences.longitude }, locationName: preferences.city }
    }
    try {
      const saved = JSON.parse(localStorage.getItem('samee3_prayer_days_v1') || 'null')
      if (saved && Array.isArray(saved.days) && Number.isFinite(saved.latitude) && Number.isFinite(saved.longitude) && saved.method === calculation.current.method && saved.school === calculation.current.school && (!hasSelectedLocation || (saved.latitude === preferences.latitude && saved.longitude === preferences.longitude))) {
        const validated = saved.days.map((day: PrayerDay) => parsePrayerDay({ code: 200, data: { timings: day.isoTimings || day.timings, meta: { timezone: day.timezone }, date: { gregorian: { date: apiPrayerDate(day.date) }, hijri: { date: day.hijri } } } }))
        if (validated.some((day: PrayerDay) => day.date === locationDate(new Date(), day.timezone))) {
          lastRefresh.current = locationDate(new Date(), validated[0].timezone)
          setDays(validated); setCoordinates({ latitude: saved.latitude, longitude: saved.longitude }); setLocationName(String(saved.city || 'الموقع المحفوظ'))
          current.current = { coordinates: { latitude: saved.latitude, longitude: saved.longitude }, locationName: String(saved.city || 'الموقع المحفوظ'), days: validated }
          if (navigator.onLine === false) setLoading(false)
        }
      }
    } catch {}
    if (hasSelectedLocation) { const c = current.current; void fetchTimings(c.coordinates.latitude, c.coordinates.longitude, c.locationName) }
    else loadCurrentLocation()
    const changed = () => {
      const selected = readWebSettings()
      if (selected.latitude === null || selected.longitude === null) return
      calculation.current = { method: selected.method, school: selected.school, timezone: selected.timezone }
      locationRequest.current += 1
      setDays([])
      void fetchTimings(selected.latitude, selected.longitude, selected.city)
    }
    window.addEventListener('samee3:prayer-settings', changed)
    const tick = () => setNow(new Date())
    const network = () => {
      setOffline(navigator.onLine === false)
      if (navigator.onLine !== false) { const { coordinates: c, locationName: label } = current.current; void fetchTimings(c.latitude, c.longitude, label) }
    }
    setOffline(navigator.onLine === false)
    const interval = window.setInterval(tick, 1000)
    window.addEventListener('online', network); window.addEventListener('offline', network); window.addEventListener('focus', tick)
    return () => { request.current += 1; locationRequest.current += 1; controllerRef.current?.abort(); clearInterval(interval); window.removeEventListener('samee3:prayer-settings', changed); window.removeEventListener('online', network); window.removeEventListener('offline', network); window.removeEventListener('focus', tick) }
  }, [fetchTimings, loadCurrentLocation])

  // Use the same explicitly saved native prayer location/method as the notification scheduler.
  useEffect(() => {
    const saved = android?.settings
    if (!saved || !Number.isFinite(saved.latitude) || !Number.isFinite(saved.longitude)) return
    calculation.current = { method: saved.method, school: saved.school, timezone: saved.timezone }
    locationRequest.current += 1
    const lat = saved.latitude!, lng = saved.longitude!
    let matchingCache = false
    try {
      const cache = JSON.parse(localStorage.getItem('samee3_prayer_days_v1') || 'null')
      matchingCache = cache?.latitude === lat && cache?.longitude === lng && cache?.method === saved.method && cache?.school === saved.school && cache?.timezone === saved.timezone
    } catch {}
    if (!matchingCache) setDays([])
    void fetchTimings(lat, lng, saved.city)
  }, [android?.settings.latitude, android?.settings.longitude, android?.settings.method, android?.settings.school, android?.settings.timezone, android?.settings.city, fetchTimings])

  useEffect(() => {
    if (!days.length) return
    const date = locationDate(now, days[0].timezone)
    if (lastRefresh.current === date) return
    lastRefresh.current = date
    if (navigator.onLine !== false) void fetchTimings(coordinates.latitude, coordinates.longitude, locationName)
  }, [days, now, coordinates, locationName, fetchTimings])

  useEffect(() => {
    if (!compassEnabled) return
    const handleOrientation = (event: DeviceOrientationEvent) => {
      const value = event as DeviceOrientationEvent & { webkitCompassHeading?: number }
      const heading = typeof value.webkitCompassHeading === 'number' ? value.webkitCompassHeading
        : event.absolute && typeof event.alpha === 'number' ? normalizeAngle(360 - event.alpha) : null
      if (heading !== null && Number.isFinite(heading)) setDeviceHeading(heading)
    }
    window.addEventListener('deviceorientation', handleOrientation, true)
    window.addEventListener('deviceorientationabsolute', handleOrientation as EventListener, true)
    return () => { window.removeEventListener('deviceorientation', handleOrientation, true); window.removeEventListener('deviceorientationabsolute', handleOrientation as EventListener, true) }
  }, [compassEnabled])

  const enableCompass = async () => {
    try {
      if (!('DeviceOrientationEvent' in window)) { setCompassPermissionState('unsupported'); return }
      const orientationEvent = DeviceOrientationEvent as typeof DeviceOrientationEvent & {
        requestPermission?: () => Promise<'granted' | 'denied'>
      }

      if (typeof orientationEvent.requestPermission === 'function') {
        const permission = await orientationEvent.requestPermission()
        setCompassPermissionState(permission)

        if (permission !== 'granted') return
      }

      setCompassEnabled(true)
    } catch (err) {
      console.error('Compass permission error:', err)
      setCompassPermissionState('denied')
    }
  }

  const compassRotation = qibla
    ? deviceHeading !== null
      ? normalizeAngle(qibla.direction - deviceHeading)
      : qibla.direction
    : 0

  const useFallbackLocation = () => {
    locationRequest.current += 1
    void fetchTimings(
      FALLBACK_LOCATION.latitude,
      FALLBACK_LOCATION.longitude,
      FALLBACK_LOCATION.city
    )
  }

  return (
    <div className="min-h-screen bg-mushaf-paper flex flex-col pb-28 md:pb-8 relative">
      {/* الهيدر */}
      <div className="flex justify-between items-center p-4 z-10 relative">
        <Link
          href="/"
          className="text-mushaf-teal bg-white p-2 rounded-full shadow-sm hover:bg-mushaf-paper transition"
          aria-label="العودة للرئيسية"
        >
          <ChevronRight size={24} />
        </Link>

        <div className="text-center">
          <h1 className="font-bold text-mushaf-dark text-lg">مواقيت الصلاة</h1>
          {hijriDate && <p className="text-[11px] text-gray-500 mt-1">{hijriDate}</p>}
        </div>

        <button
          onClick={loadCurrentLocation}
          className="text-mushaf-teal bg-white p-2 rounded-full shadow-sm hover:bg-mushaf-paper transition disabled:opacity-50"
          disabled={refreshing}
          aria-label="تحديث الموقع والمواقيت"
          title="تحديث"
        >
          <RefreshCw className={refreshing ? 'animate-spin' : ''} size={20} />
        </button>
      </div>

      {!android && <PrayerPreferences latitude={coordinates.latitude} longitude={coordinates.longitude} city={locationName}/>}
      {loading ? (
        <div className="flex-1 flex flex-col items-center justify-center text-mushaf-teal gap-4 px-6">
          <div className="w-20 h-20 rounded-full bg-white shadow-sm border border-mushaf-border/40 flex items-center justify-center">
            <Loader2 className="animate-spin" size={40} />
          </div>
          <p className="font-bold font-cairo text-center">جاري حساب المواقيت وتحديد القبلة...</p>
        </div>
      ) : (
        <div className="px-5 flex flex-col gap-6 relative z-10">
          {offline && <p role="status" className="rounded-2xl bg-amber-50 p-3 text-sm leading-7 text-amber-900">{activeDay ? 'مواقيت محفوظة للموقع الموضح أدناه.' : 'لا يوجد جدول محفوظ صالح لهذا اليوم. اتصل بالإنترنت لتحديثه.'}</p>}
          {error && (
            <div className="bg-red-50 border border-red-100 text-red-700 rounded-2xl p-4 text-sm font-bold text-center">
              {error}
            </div>
          )}

          <Link href="/notifications" className="flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-mushaf-border/50 bg-white p-4 text-sm font-bold text-mushaf-teal"><Bell size={19} />ضبط تنبيهات الصلاة والإشعارات</Link>

          {/* بطاقة الصلاة القادمة */}
          <div className="bg-gradient-to-br from-[#175E67] to-[#0D383E] rounded-3xl p-6 shadow-xl text-white relative overflow-hidden border border-mushaf-gold/20">
            <div className="absolute -top-10 -left-10 w-40 h-40 bg-white opacity-5 rounded-full blur-2xl" />
            <div className="absolute -bottom-14 -right-10 w-44 h-44 bg-mushaf-gold opacity-5 rounded-full blur-3xl" />

            <div className="flex justify-between items-start relative z-10 mb-7">
              <div className="flex items-center gap-2 bg-white/10 px-3 py-1.5 rounded-full backdrop-blur-md max-w-[75%]">
                <MapPin size={16} className="text-mushaf-gold shrink-0" />
                <span className="text-xs font-bold truncate">{locationName}</span>
              </div>

              <div className="w-11 h-11 rounded-2xl bg-white/10 border border-white/10 flex items-center justify-center">
                <Compass size={24} className="text-mushaf-gold opacity-90" />
              </div>
            </div>

            <div className="relative z-10 text-center">
              <p className="text-mushaf-gold text-sm font-bold mb-2">الصلاة القادمة</p>
              <h2 className="font-uthmani text-4xl mb-2">{nextPrayer.name}</h2>
              <p className="text-3xl font-mono tracking-wide">{formatTime(nextPrayer.time)}</p>

              <div className="mt-4 inline-flex items-center gap-2 bg-white/10 px-4 py-2 rounded-full backdrop-blur-md">
                <Clock size={16} className="text-mushaf-gold" />
                <span className="text-sm font-bold">{nextPrayer.isTomorrow ? 'غدًا بعد' : 'متبقي'}</span>
                <span className="font-mono text-mushaf-gold font-black">{formatCountdown(countdown)}</span>
              </div>
            </div>
          </div>

          {/* التاريخ */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white rounded-2xl border border-mushaf-border/40 shadow-sm p-4">
              <div className="flex items-center gap-2 text-mushaf-teal mb-2">
                <CalendarDays size={17} />
                <span className="text-xs font-bold">التاريخ الهجري</span>
              </div>
              <p className="font-bold text-mushaf-dark text-sm">{hijriDate || '—'}</p>
            </div>

            <div className="bg-white rounded-2xl border border-mushaf-border/40 shadow-sm p-4">
              <div className="flex items-center gap-2 text-mushaf-teal mb-2">
                <CalendarDays size={17} />
                <span className="text-xs font-bold">التاريخ الميلادي</span>
              </div>
              <p className="font-bold text-mushaf-dark text-sm">{gregorianDate || '—'}</p>
            </div>
          </div>

          {/* قائمة المواقيت */}
          <div className="bg-white rounded-3xl p-2 shadow-sm border border-mushaf-border/40">
            {currentPrayerItems.map((prayer) => {
              const isNext = nextPrayer.id === prayer.id

              return (
                <div
                  key={prayer.id}
                  className={`flex items-center justify-between p-4 rounded-2xl transition-all ${
                    isNext ? 'bg-mushaf-teal/5 border border-mushaf-teal/20' : 'hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center ${
                        isNext
                          ? 'bg-mushaf-teal text-white shadow-md'
                          : prayer.id === 'Sunrise'
                            ? 'bg-amber-50 text-amber-600'
                            : 'bg-mushaf-paper text-mushaf-teal'
                      }`}
                    >
                      {isNext ? (
                        <Bell size={18} />
                      ) : prayer.id === 'Sunrise' ? (
                        <Sunrise size={18} />
                      ) : (
                        <Clock size={18} />
                      )}
                    </div>

                    <span className={`font-bold ${isNext ? 'text-mushaf-teal text-lg' : 'text-mushaf-dark'}`}>
                      {prayer.name}
                    </span>
                  </div>

                  <div className={`font-mono font-bold ${isNext ? 'text-mushaf-teal text-lg' : 'text-gray-500'}`}>
                    {formatTime(prayer.time)}
                  </div>
                </div>
              )
            })}
          </div>

          {/* بطاقة القبلة */}
          <section className="bg-white rounded-3xl p-6 shadow-sm border border-mushaf-border/40">
            <div className="flex items-center justify-between gap-3 mb-5">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-mushaf-paper text-mushaf-teal flex items-center justify-center border border-mushaf-border/30">
                  <Navigation size={23} />
                </div>
                <div>
                  <h2 className="font-bold text-mushaf-dark">اتجاه القبلة</h2>
                  <p className="text-xs text-gray-500 mt-1">من موقعك الحالي باتجاه مكة المكرمة</p>
                </div>
              </div>

              <button
                onClick={enableCompass}
                className={`px-3 py-2 rounded-xl text-xs font-bold transition ${
                  compassEnabled
                    ? 'bg-mushaf-teal text-white'
                    : 'bg-mushaf-paper text-mushaf-teal hover:bg-mushaf-teal/10'
                }`}
              >
                {compassEnabled ? 'البوصلة مفعلة' : 'تفعيل البوصلة'}
              </button>
            </div>

            {qiblaLoading ? (
              <div className="py-10 flex flex-col items-center gap-3 text-mushaf-teal">
                <Loader2 className="animate-spin" size={30} />
                <span className="text-sm font-bold">جاري حساب اتجاه القبلة...</span>
              </div>
            ) : qibla ? (
              <div className="flex flex-col items-center">
                <div className="relative w-64 h-64 rounded-full bg-gradient-to-br from-[#FCFBF8] to-white border border-mushaf-border/40 shadow-inner flex items-center justify-center overflow-hidden">
                  <div className="absolute inset-4 rounded-full border border-mushaf-border/30" />
                  <div className="absolute inset-10 rounded-full border border-gray-100" />

                  <span className="absolute top-4 text-xs font-black text-mushaf-teal">ش</span>
                  <span className="absolute bottom-4 text-xs font-black text-gray-400">ج</span>
                  <span className="absolute right-4 text-xs font-black text-gray-400">ش ر</span>
                  <span className="absolute left-4 text-xs font-black text-gray-400">غ</span>

                  <div className="w-16 h-16 rounded-full bg-[#175E67] text-white flex items-center justify-center shadow-lg border-2 border-mushaf-gold relative z-10">
                    <span className="text-2xl">🕋</span>
                  </div>

                  <div
                    className="absolute inset-0 flex items-start justify-center transition-transform duration-300 ease-out"
                    style={{ transform: `rotate(${compassRotation}deg)` }}
                  >
                    <div className="relative mt-7 w-1.5 h-24 bg-gradient-to-t from-transparent via-mushaf-gold to-mushaf-gold rounded-full origin-bottom shadow-md">
                      <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-mushaf-gold border-2 border-white shadow" />
                    </div>
                  </div>
                </div>

                <div className="mt-5 text-center">
                  <p className="text-mushaf-teal font-black text-2xl">{arabicDigits(qibla.directionRounded.toFixed(1))}°</p>
                  <p className="text-sm text-gray-500 mt-1">باتجاه {qibla.compassPoint || directionName(qibla.direction)}</p>

                  {deviceHeading !== null ? (
                    <p className="text-xs text-green-600 font-bold mt-3">البوصلة تتبع اتجاه هاتفك الآن</p>
                  ) : (
                    <p className="text-xs text-gray-400 mt-3">فعّل البوصلة لتحريك المؤشر مع اتجاه الهاتف</p>
                  )}
                </div>
              </div>
            ) : (
              <div className="bg-red-50 border border-red-100 rounded-2xl p-4 text-center text-red-700 text-sm font-bold">
                {qiblaError || 'لا تتوفر بيانات القبلة حاليًا'}
              </div>
            )}

            {(compassPermissionState === 'denied' || compassPermissionState === 'unsupported') && (
              <p className="text-xs text-red-500 text-center mt-4">حساس البوصلة غير متاح أو لم تُمنح صلاحيته. استخدم زاوية القبلة المعروضة بالنسبة إلى الشمال.</p>
            )}

            <div className="mt-6 bg-mushaf-paper rounded-2xl p-4 flex items-start gap-3">
              <LocateFixed size={18} className="text-mushaf-gold shrink-0 mt-0.5" />
              <div className="text-xs text-gray-500 leading-relaxed">
                <p className="font-bold text-mushaf-dark mb-1">الموقع المستخدم</p>
                <p>
                  خط العرض: {arabicDigits(coordinates.latitude.toFixed(4))}
                  {' · '}
                  خط الطول: {arabicDigits(coordinates.longitude.toFixed(4))}
                </p>
              </div>
            </div>

            <button
              onClick={useFallbackLocation}
              className="mt-3 w-full py-3 rounded-2xl border border-mushaf-border/40 text-mushaf-teal font-bold text-sm hover:bg-mushaf-paper transition"
            >
              استخدام مسقط كالموقع الافتراضي
            </button>
          </section>

          <div className="text-center pb-3">
            <p className="text-[11px] text-gray-400 leading-relaxed">
              المواقيت والحسابات تعتمد على خدمة AlAdhan وفق طريقة الحساب المحددة داخل التطبيق.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
