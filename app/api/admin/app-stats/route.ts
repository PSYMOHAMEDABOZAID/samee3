import { NextRequest, NextResponse } from 'next/server'
import { adminConfigured, requireServerAdmin, serverDb } from '@/lib/server/firebase-admin'
import { pushConfigured } from '@/lib/server/web-push'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export async function GET(request: NextRequest) {
  if (!adminConfigured()) return NextResponse.json({ error: 'إحصاءات التثبيت تحتاج إعداد حساب خدمة Firebase على الخادم.' }, { status: 503 })
  try { await requireServerAdmin(request) } catch { return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 403 }) }
  try {
    const db = serverDb()
    const results = await Promise.all([db.doc('appMetrics/installations').get(), db.doc('appMetrics/pushScheduler').get(), db.collection('webPushSubscriptions').count().get()])
    return NextResponse.json({ installations: results[0].data() || { total: 0, platforms: {} }, scheduler: results[1].data() || null, subscriptions: results[2].data().count, pushConfigured: pushConfigured() }, { headers: { 'Cache-Control': 'no-store' } })
  } catch { return NextResponse.json({ error: 'تعذر تحديث الإحصاءات الآن.' }, { status: 502 }) }
}
