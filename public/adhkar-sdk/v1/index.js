/** SAMEE3 Adhkar SDK v1 — MIT for this SDK code. Audio retains its source terms. */
// Keep the service origin when this file is copied or bundled into another app.
const defaultOrigin = 'https://samee3.vercel.app'

export class Samee3Adhkar {
  constructor({ baseUrl = defaultOrigin, fetch: fetcher = globalThis.fetch } = {}) {
    const base = new URL(baseUrl)
    if (!['https:', 'http:'].includes(base.protocol) || base.username || base.password) throw new TypeError('Use an HTTP(S) API origin')
    if (typeof fetcher !== 'function') throw new TypeError('A Fetch implementation is required')
    this.origin = base.origin
    this.fetcher = fetcher
  }
  async request(path, query = {}, { signal } = {}) {
    const url = new URL('/api/adhkar/v1' + path, this.origin)
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null) url.searchParams.set(key, typeof value === 'boolean' ? value ? '1' : '0' : String(value))
    }
    const response = await this.fetcher(url.href, { signal })
    let data
    try { data = await response.json() } catch (error) {
      if (error?.name === 'AbortError') throw error
      throw new Error('SAMEE3 returned an unreadable response')
    }
    if (!response.ok) {
      const error = new Error(data.error || 'SAMEE3 request failed')
      error.status = response.status
      throw error
    }
    return data
  }
  index(options) { return this.request('', {}, options) }
  readers(options) { return this.request('/reciters', {}, options) }
  items(query, options) {
    if (!query?.reciter) throw new TypeError('Choose a reciter id from readers()')
    return this.request('/items', { ...query, format: 'simple' }, options)
  }
  async timings(reciter, query = {}, options) {
    const data = await this.request('/timings/' + encodeURIComponent(reciter), query, options)
    const absolute = recording => ({ ...recording, url: new URL(recording.url, this.origin).href })
    return { ...data, items: data.items.map(absolute), variants: data.variants.map(absolute), sections: data.sections.map(absolute) }
  }
  async recordings(query = {}, options) {
    const data = await this.request('/sections', query, options)
    return { ...data, recordings: data.recordings.map(recording => ({ ...recording, url: new URL(recording.url, this.origin).href })) }
  }
  async recordingTimings(id, options) {
    const data = await this.request('/sections/' + encodeURIComponent(id) + '/timings', {}, options)
    return { ...data, recording: { ...data.recording, url: new URL(data.recording.url, this.origin).href } }
  }
  async *allItems(query, options) {
    let offset = query?.offset || 0
    for (;;) {
      const page = await this.items({ ...query, limit: query?.limit || 100, offset }, options)
      for (const item of page.items) yield item
      if (page.nextOffset === null) return
      if (!Number.isSafeInteger(page.nextOffset) || page.nextOffset <= offset) throw new Error('Invalid pagination response')
      offset = page.nextOffset
    }
  }
}

export default Samee3Adhkar
