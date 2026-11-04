/** Disk-backed ZIP staging. Only one small chunk is held in JavaScript memory. */
export const ARCHIVE_DB = 'samee3-downloads-v1'
export const ARCHIVE_CHUNK_BYTES = 1024 * 1024
export type ArchiveRecord = { id: string; filename: string; title: string; size: number; chunks: number; createdAt: number; ready: boolean }
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(ARCHIVE_DB, 1)
    request.onupgradeneeded = () => {
      const db = request.result
      db.createObjectStore('archives', { keyPath: 'id' })
      db.createObjectStore('chunks', { keyPath: ['id', 'index'] })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
    request.onblocked = () => reject(new Error('أغلق نسخ سميع الأخرى ثم حاول مجددًا.'))
  })
}
async function change(store: string, operation: (object: IDBObjectStore) => void) {
  const db = await database()
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite')
      operation(tx.objectStore(store))
      tx.oncomplete = () => resolve()
      tx.onerror = tx.onabort = () => reject(tx.error || new Error('تعذر حفظ ZIP. تحقق من المساحة المتاحة.'))
    })
  } finally { db.close() }
}
export async function deleteArchive(id: string) {
  await change('chunks', store => { store.delete(IDBKeyRange.bound([id, 0], [id, Number.MAX_SAFE_INTEGER])) })
  await change('archives', store => { store.delete(id) })
}
export async function archiveRecords(): Promise<ArchiveRecord[]> {
  const db = await database()
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction('archives').objectStore('archives').getAll()
      request.onsuccess = () => resolve(request.result as ArchiveRecord[])
      request.onerror = () => reject(request.error)
    })
  } finally { db.close() }
}
export async function createArchive(record: ArchiveRecord) {
  await change('archives', store => { store.put(record) })
  let buffer = new Uint8Array(ARCHIVE_CHUNK_BYTES), used = 0
  const flush = async () => {
    if (!used) return
    const bytes = buffer.slice(0, used)
    await change('chunks', store => { store.put({ id: record.id, index: record.chunks, bytes }) })
    record.chunks += 1; record.size += used; used = 0
  }
  return {
    async write(bytes: Uint8Array) {
      let offset = 0
      while (offset < bytes.length) {
        const length = Math.min(buffer.length - used, bytes.length - offset)
        buffer.set(bytes.subarray(offset, offset + length), used)
        offset += length; used += length
        if (used === buffer.length) await flush()
      }
    },
    async close() {
      await flush(); record.ready = true
      await change('archives', store => { store.put(record) })
      buffer = new Uint8Array(0)
    },
    async abort() { buffer = new Uint8Array(0); await deleteArchive(record.id) },
  }
}
