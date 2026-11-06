import { adhkarApiIndex } from '@/lib/adhkar-developer-api'
import { adhkarApiOptions, adhkarApiResponse } from '@/lib/adhkar-api-response'
export function GET() { return adhkarApiResponse(adhkarApiIndex()) }
export const OPTIONS = adhkarApiOptions
