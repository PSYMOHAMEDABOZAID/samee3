export default {
  scheduled(event, env, context) {
    context.waitUntil((async () => {
      if (!env.CRON_SECRET || !env.SAMEE3_ORIGIN) throw new Error('Configure CRON_SECRET and SAMEE3_ORIGIN')
      const origin = new URL(env.SAMEE3_ORIGIN)
      if (origin.protocol !== 'https:') throw new Error('HTTPS is required')
      const response = await fetch(new URL('/api/cron/reminders', origin), { method: 'POST', headers: { Authorization: `Bearer ${env.CRON_SECRET}` }, signal: AbortSignal.timeout(55000) })
      if (!response.ok) throw new Error(`Reminder scheduler HTTP ${response.status}`)
    })())
  },
  fetch() { return new Response('SAMEE3 scheduled reminders', { headers: { 'Content-Type': 'text/plain' } }) },
}
