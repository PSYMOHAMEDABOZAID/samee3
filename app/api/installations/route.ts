import { NextRequest, NextResponse } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { serverDb, adminConfigured } from '@/lib/server/firebase-admin'
import { limitedJson, sameOrigin } from '@/lib/server/http'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 })
  if (!adminConfigured()) return NextResponse.json({ error: 'NOT_CONFIGURED' }, { status: 503 })
  try {
    const body = await limitedJson(request, 2048)
    if (typeof body.id !== 'string' || !/^[a-f0-9-]{36}$/.test(body.id) || !['ios', 'android', 'desktop', 'tv'].includes(String(body.platform)) || !['appinstalled', 'standalone', 'native'].includes(String(body.evidence))) return NextResponse.json({ error: 'INVALID' }, { status: 400 })
    const db = serverDb(), reference = db.doc(`appInstallations/${body.id}`)
    await db.runTransaction(async tx => {
      const existing = await tx.get(reference), metrics = db.doc('appMetrics/installations')
      if (existing.exists) {
        if (Date.now() - Number(existing.data()?.lastSeenAt || 0) > 86400000) tx.update(reference, { lastSeenAt: Date.now() })
        return
      }
      const totals = await tx.get(metrics)
      tx.create(reference, { platform: body.platform, evidence: body.evidence, createdAt: Date.now(), lastSeenAt: Date.now() })
      tx.set(metrics, { total: FieldValue.increment(1), platforms: { [String(body.platform)]: FieldValue.increment(1) }, ...(totals.exists ? {} : { startedAt: FieldValue.serverTimestamp() }), updatedAt: FieldValue.serverTimestamp() }, { merge: true })
    })
    return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })
  } catch { return NextResponse.json({ error: 'RETRY_LATER' }, { status: 503 }) }
}
