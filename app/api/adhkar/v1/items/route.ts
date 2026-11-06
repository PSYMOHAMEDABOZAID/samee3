import { adhkarPublicOrigin, filterAdhkarAudio, simpleAdhkarAudio } from '@/lib/adhkar-developer-api'
import { adhkarApiOptions, adhkarApiResponse } from '@/lib/adhkar-api-response'
export function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const format = url.searchParams.get('format')
    if (format && format !== 'simple') throw new Error('Invalid format')
    return adhkarApiResponse(format === 'simple' ? simpleAdhkarAudio(url.searchParams, adhkarPublicOrigin(process.env.SAMEE3_PUBLIC_ORIGIN)) : filterAdhkarAudio(url.searchParams))
  }
  catch (error) { return adhkarApiResponse({ error: error instanceof Error ? error.message : 'Invalid query' }, 400) }
}
export const OPTIONS = adhkarApiOptions
