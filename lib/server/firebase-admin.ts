import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { getAuth } from 'firebase-admin/auth'
export function adminConfigured() {
  return Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || (process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY))
}
function serverApp() {
  const existing = getApps().find(app => app.name === 'samee3-server')
  if (existing) return existing
  if (!adminConfigured()) throw new Error('أكمل إعداد خدمة الخادم من دليل التحديث.')
  const credential = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
    ? cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON))
    : cert({ projectId: process.env.FIREBASE_PROJECT_ID || 'samee3-fb475', clientEmail: process.env.FIREBASE_CLIENT_EMAIL, privateKey: process.env.FIREBASE_PRIVATE_KEY!.replace(/\\n/g, '\n') })
  return initializeApp({ credential }, 'samee3-server')
}
export const serverDb = () => getFirestore(serverApp())
export async function requireServerAdmin(request: Request) {
  const authorization = request.headers.get('authorization') || ''
  if (!authorization.startsWith('Bearer ')) throw new Error('UNAUTHORIZED')
  const token = await getAuth(serverApp()).verifyIdToken(authorization.slice(7), true)
  const profile = await serverDb().doc(`users/${token.uid}`).get()
  if (profile.data()?.role !== 'admin' || profile.data()?.status === 'disabled') throw new Error('UNAUTHORIZED')
  return token.uid
}
