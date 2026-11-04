import { NextRequest, NextResponse } from 'next/server'
import { limitedJson, sameOrigin } from '@/lib/server/http'
import { authorizedSubscription, pushConfigured, registerWebPush, sendWebNotification, validSubscription } from '@/lib/server/web-push'
import { parseWebSettings } from '@/lib/web-reminders'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60
const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { 'Cache-Control': 'no-store' } })
export function GET() { return json({ configured: pushConfigured(), publicKey: process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_KEY || null }) }
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return json({ error: 'هذا الطلب يجب أن يأتي من تطبيق سميع.' }, 403)
  if (!pushConfigured()) return json({ error: 'إشعارات الويب تحتاج إكمال إعداد الخادم من الإدارة.' }, 503)
  try {
    const body = await limitedJson(request)
    if (body.action === 'subscribe') {
      const settings = parseWebSettings(body.settings), subscription = validSubscription(body.subscription)
      return json(await registerWebPush(subscription, settings, typeof body.token === 'string' ? body.token : undefined))
    }
    const { reference, data } = await authorizedSubscription(String(body.id || ''), String(body.token || ''))
    if (body.action === 'unsubscribe') { await reference.delete(); return json({ ok: true }) }
    if (body.action === 'test') {
      const allowed = await reference.firestore.runTransaction(async tx => {
        const latest = await tx.get(reference)
        if (Number(latest.data()?.lastTestAt || 0) > Date.now() - 30000) return false
        tx.update(reference, { lastTestAt: Date.now() }); return true
      })
      if (!allowed) return json({ error: 'انتظر نصف دقيقة قبل تكرار الاختبار.' }, 429)
      await sendWebNotification(data.subscription, { title: 'إشعارات سميع تعمل', body: 'هذا إشعار تجريبي. يمكنك الآن ضبط الأذكار وورد القرآن ومواقيت الصلاة.', url: '/notifications', tag: 'samee3-test' })
      return json({ ok: true })
    }
    if (body.action === 'status') return json({ next: (data.events || []).slice(0, 8), lastError: data.lastError || '' })
    return json({ error: 'طلب غير صالح.' }, 400)
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (message === 'UNAUTHORIZED') return json({ error: 'الاشتراك غير متاح. فعّل الإشعارات من جديد.' }, 401)
    if (/إعدادات|اختر|اكتب|حدد|إحداثيات|المنطقة|المفاتيح|مفاتيح|اشتراك|عنوان|خدمة|راجع|بداية|أعد إيقاف/.test(message)) return json({ error: message }, 400)
    return json({ error: 'تعذر حفظ أو إرسال الإشعارات. تحقق من الاتصال وإعداد الخادم ثم أعد المحاولة.' }, 502)
  }
}
