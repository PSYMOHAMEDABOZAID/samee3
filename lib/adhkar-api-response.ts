export function adhkarApiResponse(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: {
    'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Range',
    'Cache-Control': status === 200 ? 'public, max-age=300, stale-while-revalidate=3600' : 'no-store',
    'X-Content-Type-Options': 'nosniff',
  } })
}
export function adhkarApiOptions(): Response {
  return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Range', 'Access-Control-Max-Age': '86400' } })
}
