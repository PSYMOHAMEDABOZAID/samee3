import { NextRequest, NextResponse } from 'next/server'
import { equalSecret } from '@/lib/server/http'
import { dispatchWebReminders, pushConfigured } from '@/lib/server/web-push'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60
export async function GET(request: NextRequest) {
  if (!equalSecret(request.headers.get('authorization') || '', process.env.CRON_SECRET ? `Bearer ${process.env.CRON_SECRET}` : undefined)) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
  if (!pushConfigured()) return NextResponse.json({ error: 'NOT_CONFIGURED' }, { status: 503 })
  try { return NextResponse.json(await dispatchWebReminders(), { headers: { 'Cache-Control': 'no-store' } }) }
  catch { return NextResponse.json({ error: 'DISPATCH_FAILED' }, { status: 502 }) }
}
export const POST = GET
