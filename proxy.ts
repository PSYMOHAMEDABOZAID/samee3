import { NextResponse, type NextRequest } from 'next/server'

// Static MP3s and JSON are served directly. Only CORS preflight requests
// enter this handler, so regular audio streaming keeps native Range support.
export function proxy(request: NextRequest) {
  if (request.method !== 'OPTIONS') return NextResponse.next()
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': 'Range, Content-Type, If-Range, If-None-Match',
      'Access-Control-Max-Age': '86400',
    },
  })
}

export const config = {
  matcher: [
    { source: '/audio/adhkar/:path*', has: [{ type: 'header', key: 'access-control-request-method' }] },
    { source: '/data/adhkar-audio/:path*', has: [{ type: 'header', key: 'access-control-request-method' }] },
  ],
}
