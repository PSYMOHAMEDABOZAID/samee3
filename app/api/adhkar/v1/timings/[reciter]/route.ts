import { adhkarReaderTimings } from '@/lib/adhkar-developer-api'
import { adhkarApiOptions, adhkarApiResponse } from '@/lib/adhkar-api-response'
export async function GET(request: Request, context: { params: Promise<{ reciter: string }> }) {
  const { reciter } = await context.params
  const rawCategory = new URL(request.url).searchParams.get('category')
  if (rawCategory !== null && !/^[1-9]\d{0,3}$/.test(rawCategory)) return adhkarApiResponse({ error: 'Invalid category' }, 400)
  const result = adhkarReaderTimings(reciter, rawCategory ? Number(rawCategory) : undefined)
  return result ? adhkarApiResponse(result) : adhkarApiResponse({ error: 'Unknown reciter' }, 404)
}
export const OPTIONS = adhkarApiOptions
