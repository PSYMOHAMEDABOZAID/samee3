import { adhkarAudioCatalog } from '@/lib/adhkar-developer-api'
import { adhkarApiOptions, adhkarApiResponse } from '@/lib/adhkar-api-response'
export function GET() { return adhkarApiResponse({ schemaVersion: 1, datasetVersion: adhkarAudioCatalog.datasetVersion, reciters: adhkarAudioCatalog.reciters }) }
export const OPTIONS = adhkarApiOptions
