import { adhkarSectionTimings } from '@/lib/adhkar-developer-api'
import { adhkarApiOptions, adhkarApiResponse } from '@/lib/adhkar-api-response'

export async function GET(_request: Request, context: { params: Promise<{ recording: string }> }) {
  const { recording } = await context.params
  const result = adhkarSectionTimings(recording)
  return result ? adhkarApiResponse(result) : adhkarApiResponse({ error: 'Unknown recording' }, 404)
}
export const OPTIONS = adhkarApiOptions
