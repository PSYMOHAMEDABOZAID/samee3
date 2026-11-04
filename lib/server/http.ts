import { timingSafeEqual } from 'node:crypto'
export function sameOrigin(request: Request) {
  const origin = request.headers.get('origin')
  return Boolean(origin && (origin === new URL(request.url).origin || origin === process.env.SAMEE3_PUBLIC_ORIGIN) && request.headers.get('sec-fetch-site') !== 'cross-site')
}
export async function limitedJson(request: Request, max = 16384): Promise<Record<string, unknown>> {
  if (!request.headers.get('content-type')?.startsWith('application/json') || Number(request.headers.get('content-length') || 0) > max) throw new Error('INVALID_BODY')
  const reader = request.body?.getReader()
  if (!reader) throw new Error('INVALID_BODY')
  let length = 0; const chunks: Uint8Array[] = []
  try {
    while (true) {
      const next = await reader.read()
      if (next.done) break
      length += next.value.length
      if (length > max) throw new Error('INVALID_BODY')
      chunks.push(next.value)
    }
    const result: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error('INVALID_BODY')
    return result as Record<string, unknown>
  } finally { await reader.cancel().catch(() => {}) }
}
export function equalSecret(value: string, expected?: string) {
  if (!expected || !value) return false
  const a = Buffer.from(value), b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}
