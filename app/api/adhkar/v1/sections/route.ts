import { filterAdhkarSections } from '@/lib/adhkar-developer-api'
import { adhkarApiOptions, adhkarApiResponse } from '@/lib/adhkar-api-response'
export function GET(request:Request) {
  try { return adhkarApiResponse(filterAdhkarSections(new URL(request.url).searchParams)) }
  catch(error) { return adhkarApiResponse({error:error instanceof Error?error.message:'Invalid request'},400) }
}
export const OPTIONS=adhkarApiOptions
