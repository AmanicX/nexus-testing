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

  try {
    const db = await openDB()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const req = store.put({ id, blob, prompt, createdAt: Date.now() })
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
    })
  } catch {
    // Memory fallback if IndexedDB is restricted
  }

  return objectUrl
}

export async function getImageBlob(id: string): Promise<string | null> {
  if (memoryImages.has(id)) {
    return memoryImages.get(id)!.url
  }

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

  return null
}
