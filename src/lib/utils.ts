import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function publicUrl(path: string) {
  const base = import.meta.env.BASE_URL || '/'
  return `${base}${path.replace(/^\/+/, '')}`
}

export function uid(prefix = 'id') {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}${Date.now()
    .toString(36)
    .slice(-4)}`
}

export function now() {
  return Date.now()
}

export function timeAgo(ts: number) {
  const s = Math.floor((Date.now() - ts) / 1000)
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}d ago`
  return new Date(ts).toLocaleDateString()
}

export function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
}

export function isEmoji(value: string) {
  if (!value) return false
  const stripped = value.replace(/\uFE0F/gu, '').replace(/[\p{Extended_Pictographic}\u200d\s]/gu, '')
  return stripped.length === 0
}

export function isImage(value: string) {
  if (!value) return false
  return (
    value.startsWith('data:image') ||
    value.startsWith('http://') ||
    value.startsWith('https://') ||
    value.startsWith('blob:') ||
    value.startsWith('/') ||
    /\.(png|jpe?g|gif|webp|svg|avif)(\?|#|$)/i.test(value)
  )
}

export function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n))
}

export function getExtensionForMime(mime: string): string {
  switch (mime.toLowerCase().split(';')[0].trim()) {
    case 'image/jpeg':
    case 'image/jpg':
      return 'jpg'
    case 'image/webp':
      return 'webp'
    case 'image/png':
      return 'png'
    case 'image/gif':
      return 'gif'
    case 'image/svg+xml':
      return 'svg'
    default:
      return ''
  }
}

export function detectImageMimeFromBytes(bytes: Uint8Array): string {
  if (bytes.length >= 8 && bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71) {
    return 'image/png'
  }
  if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) {
    return 'image/jpeg'
  }
  if (bytes.length >= 12 && bytes[0] === 82 && bytes[1] === 73 && bytes[2] === 70 && bytes[3] === 70) {
    const riffType = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11])
    if (riffType === 'WEBP') return 'image/webp'
  }
  return ''
}

export async function download(filename: string, content: string | Blob, mimeType?: string) {
  let url = ''
  let revoke = false
  let resolvedMime = mimeType || ''

  if (content instanceof Blob) {
    resolvedMime = content.type || resolvedMime
    url = URL.createObjectURL(content)
    revoke = true
  } else if (typeof content === 'string') {
    if (
      content.startsWith('blob:') ||
      content.startsWith('data:') ||
      content.startsWith('http:') ||
      content.startsWith('https:')
    ) {
      if (content.startsWith('data:')) {
        const match = /^data:([^;,]+)/i.exec(content)
        if (match) resolvedMime = match[1]
      }
      try {
        const res = await fetch(content)
        const blob = await res.blob()
        resolvedMime = blob.type || resolvedMime
        if (!resolvedMime || resolvedMime === 'application/octet-stream') {
          const buffer = await blob.arrayBuffer()
          const detected = detectImageMimeFromBytes(new Uint8Array(buffer.slice(0, 16)))
          if (detected) resolvedMime = detected
        }
        url = URL.createObjectURL(blob)
        revoke = true
      } catch {
        url = content
      }
    } else {
      const type = mimeType || (filename.endsWith('.json') ? 'application/json' : 'text/plain;charset=utf-8')
      resolvedMime = type
      const blob = new Blob([content], { type })
      url = URL.createObjectURL(blob)
      revoke = true
    }
  }

  // Preserve and apply the correct extension for known formats (PNG, JPEG, WebP)
  let finalFilename = filename
  const ext = getExtensionForMime(resolvedMime)
  if (ext) {
    if (/\.(png|jpe?g|webp|gif|svg)$/i.test(finalFilename)) {
      finalFilename = finalFilename.replace(/\.(png|jpe?g|webp|gif|svg)$/i, `.${ext}`)
    } else {
      finalFilename = `${finalFilename}.${ext}`
    }
  }

  const a = document.createElement('a')
  a.href = url
  a.download = finalFilename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  if (revoke) {
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
}

export function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export function imageFileToResizedDataURL(file: File, max = 256): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.width, img.height))
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(img.width * scale)
        canvas.height = Math.round(img.height * scale)
        const ctx = canvas.getContext('2d')
        if (!ctx) return reject(new Error('no canvas'))
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/jpeg', 0.85))
      }
      img.onerror = reject
      img.src = String(reader.result)
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export function copyText(text: string) {
  return navigator.clipboard?.writeText(text)
}

const AVATAR_COLORS = [
  '#7c5cff',
  '#37d7e8',
  '#ff5f9e',
  '#ffa34d',
  '#34d399',
  '#0ea5e9',
  '#f472b6',
  '#a78bfa',
  '#fb7185',
  '#22d3ee',
]

export function pickColor(seed?: string) {
  if (!seed) return AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)]
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}
