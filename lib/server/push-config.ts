import { createECDH } from 'node:crypto'
import { validPushPublicKey } from '../push-key'

export function validatePushConfiguration(env: Record<string, string | undefined>) {
  const publicKey = env.NEXT_PUBLIC_WEB_PUSH_VAPID_KEY
  const privateKey = env.WEB_PUSH_VAPID_PRIVATE_KEY
  if (!validPushPublicKey(publicKey)) return { ok: false, code: 'INVALID_VAPID_PUBLIC_KEY' } as const
  if (!privateKey || !/^[A-Za-z0-9_-]{43}$/.test(privateKey)) return { ok: false, code: 'INVALID_VAPID_PRIVATE_KEY' } as const
  try {
    const key = createECDH('prime256v1')
    key.setPrivateKey(Buffer.from(privateKey, 'base64url'))
    if (key.getPublicKey().toString('base64url') !== publicKey) return { ok: false, code: 'VAPID_KEY_PAIR_MISMATCH' } as const
  } catch { return { ok: false, code: 'INVALID_VAPID_PRIVATE_KEY' } as const }
  const subject = env.WEB_PUSH_SUBJECT || ''
  if (!/^(?:mailto:[^\s@]+@[^\s@]+\.[^\s@]+|https:\/\/[^\s]+)$/.test(subject)) return { ok: false, code: 'INVALID_VAPID_SUBJECT' } as const
  if (!env.CRON_SECRET) return { ok: false, code: 'MISSING_CRON_SECRET' } as const
  return { ok: true, code: 'READY' } as const
}
