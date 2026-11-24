/**
 * Persistent Image Storage using browser IndexedDB with memory fallback.
 * Keeps raw image binaries out of localStorage.
 */

const DB_NAME = 'eva_image_store'
const DB_VERSION = 1
const STORE_NAME = 'images'

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return reject(new Error('IndexedDB not supported in this environment'))
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' })
      }
    }
  })
}

const memoryImages = new Map<string, { id: string; blob: Blob; url: string; prompt: string }>()

export async function storeImageBlob(
  id: string,
  blob: Blob,
  prompt: string,
): Promise<string> {
  const objectUrl = URL.createObjectURL(blob)
  memoryImages.set(id, { id, blob, url: objectUrl, prompt })

  if (typeof window !== 'undefined' && window.indexedDB) {
    try {
      const db = await openDB()
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite')
        const store = tx.objectStore(STORE_NAME)
        store.put({ id, blob, prompt, createdAt: Date.now() })
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error || new Error('IndexedDB transaction failed'))
        tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted'))
      })
    } catch (error) {
      URL.revokeObjectURL(objectUrl)
      memoryImages.delete(id)
      throw new Error(`Failed to save image to offline storage: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  return objectUrl
}

export async function getImageBlob(id: string): Promise<string | null> {
  if (memoryImages.has(id)) {
    return memoryImages.get(id)!.url
  }

  if (typeof window !== 'undefined' && window.indexedDB) {
    try {
      const db = await openDB()
      const record = await new Promise<{ id: string; blob: Blob } | null>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly')
        const store = tx.objectStore(STORE_NAME)
        const req = store.get(id)
        req.onsuccess = () => resolve(req.result || null)
        req.onerror = () => reject(req.error)
      })

      if (record?.blob) {
        const url = URL.createObjectURL(record.blob)
        memoryImages.set(id, { id, blob: record.blob, url, prompt: '' })
        return url
      }
    } catch {
      /* ignore */
    }
  }

  return null
}

export async function deleteImage(id: string): Promise<void> {
  const existing = memoryImages.get(id)
  if (existing?.url && existing.url.startsWith('blob:')) {
    try { URL.revokeObjectURL(existing.url) } catch { /* ignore */ }
  }
  memoryImages.delete(id)

  if (typeof window !== 'undefined' && window.indexedDB) {
    try {
      const db = await openDB()
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite')
        const store = tx.objectStore(STORE_NAME)
        store.delete(id)
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
        tx.onabort = () => reject(tx.error)
      })
    } catch {
      /* ignore */
    }
  }
}

export async function deleteImages(ids: string[]): Promise<void> {
  if (!ids.length) return
  for (const id of ids) {
    const existing = memoryImages.get(id)
    if (existing?.url && existing.url.startsWith('blob:')) {
      try { URL.revokeObjectURL(existing.url) } catch { /* ignore */ }
    }
    memoryImages.delete(id)
  }

  if (typeof window !== 'undefined' && window.indexedDB) {
    try {
      const db = await openDB()
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite')
        const store = tx.objectStore(STORE_NAME)
        for (const id of ids) {
          store.delete(id)
        }
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
        tx.onabort = () => reject(tx.error)
      })
    } catch {
      /* ignore */
    }
  }
}

export async function clearAllImages(): Promise<void> {
  for (const item of memoryImages.values()) {
    if (item.url && item.url.startsWith('blob:')) {
      try { URL.revokeObjectURL(item.url) } catch { /* ignore */ }
    }
  }
  memoryImages.clear()
  if (typeof window !== 'undefined' && window.indexedDB) {
    try {
      const db = await openDB()
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite')
        const store = tx.objectStore(STORE_NAME)
        store.clear()
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
        tx.onabort = () => reject(tx.error)
      })
    } catch {
      /* ignore */
    }
  }
}
