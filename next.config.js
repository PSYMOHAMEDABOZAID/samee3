const { PHASE_PRODUCTION_SERVER } = require('next/constants')
const { readFileSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')
const { randomUUID } = require('node:crypto')

function buildIdentity(phase) {
  const configured = process.env.SAMEE3_BUILD_ID || process.env.VERCEL_DEPLOYMENT_ID || process.env.VERCEL_GIT_COMMIT_SHA
  if (configured) return configured
  if (phase === PHASE_PRODUCTION_SERVER) {
    try { return readFileSync(join(__dirname, '.next', 'BUILD_ID'), 'utf8').trim() } catch { return 'development' }
  }
  // All build workers inherit the same value. A second build receives a new ID.
  const value = randomUUID()
  process.env.SAMEE3_BUILD_ID = value
  return value
}

module.exports = (phase) => {
  const appBuildId = buildIdentity(phase)
  if (phase !== PHASE_PRODUCTION_SERVER) {
    writeFileSync(join(__dirname, 'public/sw-build.js'), `self.SAMEE3_BUILD_ID = ${JSON.stringify(appBuildId)}\n`)
  }
  /** @type {import('next').NextConfig} */
  const nextConfig = {
  reactStrictMode: true,
  env: { NEXT_PUBLIC_SAMEE3_BUILD_ID: appBuildId },
  generateBuildId: async () => appBuildId,
  poweredByHeader: false,
  images: { localPatterns: [{ pathname: '/**', search: '' }, { pathname: '/icon-192.png' }] },

  outputFileTracingIncludes: {
    '/api/mushaf-riwaya-image': [
      './data/mushaf/**',
    ],
    '/api/quran': [
      './data/mushaf/*.text.json.gz',
    ],
    '/api/quran-now-playing': [
      './data/mushaf/*.text.json.gz',
    ],
  },

  typescript: {
    ignoreBuildErrors: false,
  },

  async headers() {
    return [
      { source: '/audio/adhkar/:path*', headers: [{ key: 'Access-Control-Allow-Origin', value: '*' }, { key: 'Access-Control-Expose-Headers', value: 'Content-Length, Content-Range, Accept-Ranges, ETag' }, { key: 'Cache-Control', value: 'public, max-age=3600' }] },
      { source: '/data/adhkar-audio/:path*', headers: [{ key: 'Access-Control-Allow-Origin', value: '*' }, { key: 'Cache-Control', value: 'public, max-age=300' }] },
      { source: '/sw.js', headers: [{ key: 'Cache-Control', value: 'no-cache, max-age=0, must-revalidate' }, { key: 'Service-Worker-Allowed', value: '/' }] },
      { source: '/sw-build.js', headers: [{ key: 'Cache-Control', value: 'no-cache, max-age=0, must-revalidate' }] },
      { source: '/manifest.json', headers: [{ key: 'Cache-Control', value: 'no-cache, max-age=0, must-revalidate' }] },
      { source: '/android/release.json', headers: [{ key: 'Cache-Control', value: 'no-store, max-age=0' }] },
      { source: '/app-downloads.json', headers: [{ key: 'Cache-Control', value: 'no-store, max-age=0' }] },
      { source: '/android/:file*.apk', headers: [{ key: 'Content-Type', value: 'application/vnd.android.package-archive' }, { key: 'Cache-Control', value: 'no-cache, max-age=0, must-revalidate' }] },
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'X-Frame-Options',
            value: 'SAMEORIGIN',
          },
        ],
      },
    ]
  },
}

  return nextConfig
}
