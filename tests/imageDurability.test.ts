import { describe, it, expect, vi, beforeEach } from 'vitest'
import { storeImageBlob, getImageBlob, clearAllImages, deleteImage, deleteImages } from '@/lib/imageStorage'
import { download } from '@/lib/utils'
import { useStore } from '@/store/useStore'

describe('Image Durability & Download Verification', () => {
  beforeEach(async () => {
    await clearAllImages()
  })

  it('stores and retrieves image blobs by ID', async () => {
    const fakeBlob = new Blob(['fake image bytes'], { type: 'image/png' })
    const imageId = 'img_test_123'

    const storedUrl = await storeImageBlob(imageId, fakeBlob, 'a scenic mountain')
    expect(storedUrl).toBeDefined()

    // Restore from store by ID
    const restoredUrl = await getImageBlob(imageId)
    expect(restoredUrl).toBeDefined()
    expect(typeof restoredUrl).toBe('string')
  })

  it('clearAllImages wipes stored images and revokes object URLs', async () => {
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL')
    const fakeBlob = new Blob(['bytes'], { type: 'image/png' })
    const url = await storeImageBlob('img_test_to_clear', fakeBlob, 'test prompt')

    await clearAllImages()

    const retrieved = await getImageBlob('img_test_to_clear')
    expect(retrieved).toBeNull()
    expect(revokeSpy).toHaveBeenCalledWith(url)
    revokeSpy.mockRestore()
  })

  it('deleteImage and deleteImages delete images and revoke their object URLs', async () => {
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL')
    const fakeBlob = new Blob(['bytes'], { type: 'image/jpeg' })
    const url1 = await storeImageBlob('img_to_delete_1', fakeBlob, 'portrait prompt 1')
    const url2 = await storeImageBlob('img_to_delete_2', fakeBlob, 'portrait prompt 2')

    await deleteImage('img_to_delete_1')
    expect(await getImageBlob('img_to_delete_1')).toBeNull()
    expect(revokeSpy).toHaveBeenCalledWith(url1)

    await deleteImages(['img_to_delete_2'])
    expect(await getImageBlob('img_to_delete_2')).toBeNull()
    expect(revokeSpy).toHaveBeenCalledWith(url2)

    revokeSpy.mockRestore()
  })

  it('deleting an image message cleans up orphaned image record but preserves referenced images', async () => {
    const fakeBlob = new Blob(['bytes'], { type: 'image/png' })
    await storeImageBlob('shared_img', fakeBlob, 'shared prompt')
    await storeImageBlob('unique_img', fakeBlob, 'unique prompt')

    const store = useStore.getState()
    store.newConversation('char1')
    const conv = useStore.getState().conversations[0]

    // Add two image messages, one with unique_img, one with shared_img
    store.addMessage(conv.id, {
      id: 'msg_1', role: 'assistant', content: '', type: 'image',
      image: { id: 'unique_img', prompt: 'unique prompt', url: 'blob:unique' },
      timestamp: Date.now(),
    })
    store.addMessage(conv.id, {
      id: 'msg_2', role: 'assistant', content: '', type: 'image',
      image: { id: 'shared_img', prompt: 'shared prompt', url: 'blob:shared' },
      timestamp: Date.now(),
    })

    // Also add another conversation sharing shared_img
    store.newConversation('char2')
    const conv2 = useStore.getState().conversations.find((c) => c.id !== conv.id)!
    store.addMessage(conv2.id, {
      id: 'msg_3', role: 'assistant', content: '', type: 'image',
      image: { id: 'shared_img', prompt: 'shared prompt', url: 'blob:shared' },
      timestamp: Date.now(),
    })

    // Removing msg_1 should delete unique_img
    store.removeMessage(conv.id, 'msg_1')
    expect(await getImageBlob('unique_img')).toBeNull()

    // Removing msg_2 from conv should NOT delete shared_img because conv2 still references it
    store.removeMessage(conv.id, 'msg_2')
    expect(await getImageBlob('shared_img')).not.toBeNull()

    // Deleting conv2 should now delete shared_img since it was the last reference
    store.deleteConversation(conv2.id)
    expect(await getImageBlob('shared_img')).toBeNull()
  })

  it('fails clearly and revokes object URL if IndexedDB write fails', async () => {
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL')
    const fakeDB = {
      transaction: () => ({
        objectStore: () => ({
          put: () => ({}),
        }),
        set oncomplete(_: any) {},
        set onerror(cb: any) {
          setTimeout(() => cb(), 0)
        },
        set onabort(_: any) {},
        error: new Error('Disk quota exceeded'),
      }),
    }
    const fakeIndexedDB = {
      open: () => ({
        set onsuccess(cb: any) {
          setTimeout(() => {
            ;(this as any).result = fakeDB
            cb()
          }, 0)
        },
        set onerror(_: any) {},
        set onupgradeneeded(_: any) {},
      }),
    }
    ;(globalThis as any).window = { indexedDB: fakeIndexedDB }

    const blob = new Blob(['bytes'], { type: 'image/png' })
    await expect(storeImageBlob('fail_img', blob, 'prompt')).rejects.toThrow('Failed to save image to offline storage')
    expect(revokeSpy).toHaveBeenCalled()

    delete (globalThis as any).window
    revokeSpy.mockRestore()
  })

  it('download function correctly sets filename and triggers anchor click without argument reversal', async () => {
    let clickedHref = ''
    let clickedDownload = ''

    const fakeAnchor: any = {
      set href(val: string) {
        clickedHref = val
      },
      get href() {
        return clickedHref
      },
      set download(val: string) {
        clickedDownload = val
      },
      get download() {
        return clickedDownload
      },
      click: vi.fn(),
    }

    const mockDoc = {
      createElement: vi.fn().mockReturnValue(fakeAnchor),
      body: {
        appendChild: vi.fn().mockReturnValue(fakeAnchor),
        removeChild: vi.fn().mockReturnValue(fakeAnchor),
      },
    }

    ;(globalThis as any).document = mockDoc

    const filename = 'eva-scene-test123.png'
    const content = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

    await download(filename, content, 'image/png')

    // Verify filename is in the download property, NOT the href property
    expect(clickedDownload).toBe('eva-scene-test123.png')
    expect(clickedHref).toBeDefined()
    expect(fakeAnchor.click).toHaveBeenCalledTimes(1)
  })

  it.each([
    { format: 'png', mime: 'image/png', expected: 'eva-scene-1.png' },
    { format: 'jpeg', mime: 'image/jpeg', expected: 'eva-scene-1.jpg' },
    { format: 'webp', mime: 'image/webp', expected: 'eva-scene-1.webp' },
  ])('determines correct extension for $format download without transcoding', async ({ mime, expected }) => {
    let clickedDownload = ''
    const fakeAnchor: any = {
      set href(_: string) {},
      get href() { return '' },
      set download(val: string) { clickedDownload = val },
      get download() { return clickedDownload },
      click: vi.fn(),
    }
    const mockDoc = {
      createElement: vi.fn().mockReturnValue(fakeAnchor),
      body: {
        appendChild: vi.fn().mockReturnValue(fakeAnchor),
        removeChild: vi.fn().mockReturnValue(fakeAnchor),
      },
    }
    ;(globalThis as any).document = mockDoc

    const blob = new Blob(['sample-image-bytes'], { type: mime })
    // Test both without extension and with wrong .png extension
    await download('eva-scene-1', blob)
    expect(clickedDownload).toBe(expected)

    await download('eva-scene-1.png', blob)
    expect(clickedDownload).toBe(expected)
  })
})
