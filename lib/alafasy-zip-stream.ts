/**
 * Streaming STORE-only ZIP writer for MP3 files. No JSZip, temporary MP3 files,
 * or in-memory complete-mushaf Blob. MP3 is already compressed; storing it is
 * both faster and safer than re-compressing it.
 *
 * ZIP uses a data descriptor so sizes and CRCs need not be known before each
 * recording is streamed. ZIP64 central-directory offsets are supported.
 */

const MAX_UINT32 = 0xffffffff
const encoder = new TextEncoder()
const CRC_TABLE = new Uint32Array(256)
for (let n = 0; n < 256; n += 1) {
  let c = n
  for (let bit = 0; bit < 8; bit += 1) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1
  CRC_TABLE[n] = c >>> 0
}

type RecordEntry = {
  filename: Uint8Array
  crc: number
  size: number
  offset: number
  time: number
  date: number
}

function put64(view: DataView, pos: number, value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('حجم ملف ZIP غير صالح.')
  view.setUint32(pos, value >>> 0, true)
  view.setUint32(pos + 4, Math.floor(value / 0x100000000), true)
}

function dosDateTime(now = new Date()): { date: number; time: number } {
  const year = Math.min(2107, Math.max(1980, now.getFullYear()))
  return {
    date: ((year - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate(),
    time: (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2),
  }
}

function updatedCrc(crc: number, bytes: Uint8Array): number {
  let c = crc
  for (let i = 0; i < bytes.length; i += 1) c = CRC_TABLE[(c ^ bytes[i]) & 255] ^ (c >>> 8)
  return c >>> 0
}

function bytesOf(buffer: ArrayBuffer): Uint8Array {
  return new Uint8Array(buffer)
}

/** Stream one complete MP3 or small text file, then finalize its ZIP record. */
export class StreamingMushafZip {
  private offset = 0
  private readonly entries: RecordEntry[] = []

  async *add(
    filename: string,
    source: AsyncIterable<Uint8Array>,
  ): AsyncGenerator<Uint8Array> {
    if (!filename || filename.startsWith('/') || /(?:^|\/)\.\.(?:\/|$)/.test(filename)) {
      throw new Error('اسم ملف غير صالح داخل ZIP.')
    }
    if (this.entries.length >= 65535) throw new Error('عدد ملفات ZIP تجاوز الحد.')
    const name = encoder.encode(filename)
    if (name.byteLength > 65535) throw new Error('اسم الملف طويل جدًا.')
    const { date, time } = dosDateTime()
    const originalOffset = this.offset
    const header = new ArrayBuffer(30)
    const headerView = new DataView(header)
    headerView.setUint32(0, 0x04034b50, true)
    headerView.setUint16(4, 20, true)   // Version 2.0 (data descriptor)
    headerView.setUint16(6, 0x0808, true) // UTF-8 filenames + data descriptor
    headerView.setUint16(8, 0, true)     // STORE: do not compress MP3
    headerView.setUint16(10, time, true)
    headerView.setUint16(12, date, true)
    headerView.setUint16(26, name.byteLength, true)
    this.offset += 30 + name.byteLength
    yield bytesOf(header)
    yield name

    let crc = 0xffffffff
    let size = 0
    for await (const chunk of source) {
      if (!(chunk instanceof Uint8Array)) throw new Error('مصدر صوت غير صالح.')
      if (!chunk.byteLength) continue
      size += chunk.byteLength
      if (size > MAX_UINT32) throw new Error('ملف MP3 منفرد تجاوز حجم ZIP التقليدي.')
      crc = updatedCrc(crc, chunk)
      this.offset += chunk.byteLength
      yield chunk
    }
    if (!size) throw new Error('ملف الصوت فارغ.')
    crc = (crc ^ 0xffffffff) >>> 0
    const descriptor = new ArrayBuffer(16)
    const descriptorView = new DataView(descriptor)
    descriptorView.setUint32(0, 0x08074b50, true)
    descriptorView.setUint32(4, crc, true)
    descriptorView.setUint32(8, size, true)
    descriptorView.setUint32(12, size, true)
    this.offset += 16
    this.entries.push({ filename: name, crc, size, offset: originalOffset, time, date })
    yield bytesOf(descriptor)
  }

  *finish(): Generator<Uint8Array> {
    const directoryOffset = this.offset
    for (const entry of this.entries) {
      const needsZip64Offset = entry.offset > MAX_UINT32
      // ZIP64 central-directory extra records only the local header offset when needed.
      const extra = needsZip64Offset ? new ArrayBuffer(12) : new ArrayBuffer(0)
      if (needsZip64Offset) {
        const extraView = new DataView(extra)
        extraView.setUint16(0, 0x0001, true)
        extraView.setUint16(2, 8, true)
        put64(extraView, 4, entry.offset)
      }
      const header = new ArrayBuffer(46)
      const view = new DataView(header)
      view.setUint32(0, 0x02014b50, true)
      view.setUint16(4, needsZip64Offset ? 45 : 20, true)
      view.setUint16(6, needsZip64Offset ? 45 : 20, true)
      view.setUint16(8, 0x0808, true)
      view.setUint16(10, 0, true)
      view.setUint16(12, entry.time, true)
      view.setUint16(14, entry.date, true)
      view.setUint32(16, entry.crc, true)
      view.setUint32(20, entry.size, true)
      view.setUint32(24, entry.size, true)
      view.setUint16(28, entry.filename.byteLength, true)
      view.setUint16(30, extra.byteLength, true)
      view.setUint32(42, needsZip64Offset ? MAX_UINT32 : entry.offset, true)
      const data = [bytesOf(header), entry.filename, bytesOf(extra)]
      for (const segment of data) {
        this.offset += segment.byteLength
        yield segment
      }
    }
    const centralSize = this.offset - directoryOffset
    const needsZip64 = directoryOffset > MAX_UINT32 || centralSize > MAX_UINT32
    if (needsZip64) {
      const recordOffset = this.offset
      const zip64 = new ArrayBuffer(56)
      const view = new DataView(zip64)
      view.setUint32(0, 0x06064b50, true)
      put64(view, 4, 44)
      view.setUint16(12, 45, true)
      view.setUint16(14, 45, true)
      put64(view, 24, this.entries.length)
      put64(view, 32, this.entries.length)
      put64(view, 40, centralSize)
      put64(view, 48, directoryOffset)
      this.offset += zip64.byteLength
      yield bytesOf(zip64)
      const locator = new ArrayBuffer(20)
      const locatorView = new DataView(locator)
      locatorView.setUint32(0, 0x07064b50, true)
      put64(locatorView, 8, recordOffset)
      locatorView.setUint32(16, 1, true)
      this.offset += locator.byteLength
      yield bytesOf(locator)
    }
    const end = new ArrayBuffer(22)
    const endView = new DataView(end)
    endView.setUint32(0, 0x06054b50, true)
    endView.setUint16(8, this.entries.length, true)
    endView.setUint16(10, this.entries.length, true)
    endView.setUint32(12, needsZip64 ? MAX_UINT32 : centralSize, true)
    endView.setUint32(16, needsZip64 ? MAX_UINT32 : directoryOffset, true)
    yield bytesOf(end)
  }
}

export async function* chunksOf(body: ReadableStream<Uint8Array>): AsyncGenerator<Uint8Array> {
  const reader = body.getReader()
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (value?.length) yield value
    }
  } finally {
    try { await reader.cancel() } catch { /* response already closed */ }
    reader.releaseLock()
  }
}

export async function* textChunks(content: string): AsyncGenerator<Uint8Array> {
  yield encoder.encode(content)
}
