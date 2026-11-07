// app/layout.tsx
import './globals.css'
import type { Metadata, Viewport } from 'next'
import { Suspense, type ReactNode } from 'react'
import { AuthProvider } from '@/context/AuthContext'
import BottomNav from '@/components/BottomNav'
import ServiceWorkerRegistration from '@/components/ServiceWorkerRegistration'
import ConnectionBanner from '@/components/ConnectionBanner'
import OfflineBootstrap from '@/components/OfflineBootstrap'
import AudioFocus from '@/components/AudioFocus'
import RiwayatDownloadStatus from '@/components/RiwayatDownloadStatus'
import AppExperience from '@/components/AppExperience'
import Samee3WidgetSync from '@/components/Samee3WidgetSync'
import { APP_BUILD_ID } from '@/lib/app-version'

const iconVersion = encodeURIComponent(APP_BUILD_ID)

export const metadata: Metadata = {
  title: { default: 'مصحف سميع', template: '%s | مصحف سميع' },
  description: 'موقع ومنصة سميع القرآنية الشاملة. اقرأ القرآن الكريم بروايات متعددة، واستمع للتلاوات والأذكار، وتابع وردك واحفظ ما يتاح دون إنترنت.',
  applicationName: 'مصحف سميع',
  manifest: '/manifest.json',
  keywords: ['مصحف سميع', 'القرآن الكريم', 'مصحف', 'قرآن', 'قراء', 'استماع القرآن', 'تحميل القرآن'],
  authors: [{ name: 'مصحف سميع' }], creator: 'مصحف سميع', publisher: 'مصحف سميع',
  robots: { index: true, follow: true },
  icons: {
    apple: [{ url: `/apple-touch-icon.png?v=${iconVersion}`, sizes: '180x180', type: 'image/png' }],
    icon: [
      { url: `/icon-192.png?v=${iconVersion}`, type: 'image/png', sizes: '192x192' },
      { url: `/icon-512.png?v=${iconVersion}`, type: 'image/png', sizes: '512x512' },
      { url: `/icon.svg?v=${iconVersion}`, type: 'image/svg+xml', sizes: 'any' },
    ],
    shortcut: [{ url: `/icon.svg?v=${iconVersion}`, type: 'image/svg+xml', sizes: 'any' }],
  },
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'مصحف سميع' },
  formatDetection: { telephone: false },
}

export const viewport: Viewport = {
  themeColor: '#8A642D', width: 'device-width', initialScale: 1, viewportFit: 'cover',
}

// ES5-only detector: runs before React. A site that renders but cannot hydrate is not "working".
// The Quran and download portal is plain HTML and cannot enter a redirect loop.
const legacyBrowserDetector = `(function(){
  if (/^\\/legacy(?:\\/|$)/.test(location.pathname)) return;
  var ok = typeof Promise !== 'undefined' && typeof Map !== 'undefined' &&
    typeof Set !== 'undefined' && typeof Symbol !== 'undefined' &&
    typeof fetch === 'function' && typeof AbortController !== 'undefined' &&
    typeof Object.assign === 'function';
  try { if (ok) ok = (new Function('var x={a:{b:1}}; return x?.a?.b ?? 0;'))() === 1; }
  catch(e) { ok = false; }
  if (!ok) location.replace('/legacy/index.html');
})();`

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <html lang="ar" dir="rtl">
    <head><script dangerouslySetInnerHTML={{ __html: legacyBrowserDetector }} /></head>
    <body className="min-h-screen antialiased">
      <noscript>
        <div style={{ padding: '16px', textAlign: 'center', background: '#194f43', color: '#fff' }}>
          هذا المتصفح لا يشغّل JavaScript. يمكنك استخدام <a href="/legacy/index.html" style={{ color: '#f7d992', textDecoration: 'underline' }}>سميع للأجهزة القديمة</a> لقراءة المصحف وتحميل التطبيقات.
        </div>
      </noscript>
      <AuthProvider>
        <div className="min-h-screen">
          <Suspense fallback={<div dir="rtl" className="flex min-h-screen items-center justify-center text-[#8a642d]">جارٍ فتح سميع…</div>}>
            {children}
          </Suspense>
        </div>
        <BottomNav />
        <ServiceWorkerRegistration />
        <ConnectionBanner />
        <OfflineBootstrap />
        <AudioFocus />
        <RiwayatDownloadStatus />
        <AppExperience />
        <Samee3WidgetSync />
      </AuthProvider>
    </body>
  </html>
}
