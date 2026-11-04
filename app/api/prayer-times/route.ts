import { NextRequest, NextResponse } from 'next/server'
import { locationDate } from '@/lib/prayer-times'
import { PRAYER_METHODS } from '@/lib/web-reminders'
import { prayerSource } from '@/lib/server/prayer-source'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const lat = Number(params.get('latitude')), lng = Number(params.get('longitude')), method = Number(params.get('method') || 8), school = Number(params.get('school') || 0)
  const timezone = params.get('timezone') || undefined
  let date = params.get('date') || ''
  try {
    if (timezone) locationDate(new Date(), timezone)
    if (!date) date = locationDate(new Date(), timezone || 'UTC')
    if (!params.has('latitude') || !params.has('longitude') || !Number.isFinite(lat) || Math.abs(lat) > 90 || !Number.isFinite(lng) || Math.abs(lng) > 180 || ![0, 1].includes(school) || !PRAYER_METHODS.some(([id]) => id === method) || !/^\d{4}-\d{2}-\d{2}$/.test(date) || new Date(date + 'T12:00:00Z').toISOString().slice(0, 10) !== date) throw new Error('INVALID')
  } catch { return NextResponse.json({ error: 'راجع الموقع وطريقة الحساب والتاريخ.' }, { status: 400 }) }
  try {
    const result = await prayerSource(date, { latitude: lat, longitude: lng, method, school, timezone })
    return NextResponse.json(result.payload, { headers: { 'Cache-Control': 'private, max-age=300' } })
  } catch { return NextResponse.json({ error: 'تعذر تحديث المواقيت. أعد المحاولة؛ يُعرض آخر جدول صالح محفوظ لموقعك.' }, { status: 502, headers: { 'Cache-Control': 'no-store' } }) }
}
