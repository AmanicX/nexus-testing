export const IMAGE_STYLES = [
  { id: 'natural', label: 'Auto / As written', prompt: '' },
  { id: 'anime', label: 'Anime', prompt: 'Anime illustration, expressive linework, cel shading and carefully composed color.' },
  { id: 'photo', label: 'Photographic', prompt: 'Photorealistic photography, natural textures, plausible light and optical depth.' },
  { id: 'cinematic', label: 'Cinematic', prompt: 'Cinematic composition, intentional dramatic lighting and film-like color grading.' },
  { id: 'watercolor', label: 'Watercolor', prompt: 'Watercolor painting on textured paper, translucent washes and soft pigment edges.' },
  { id: 'digital', label: 'Digital painting', prompt: 'Detailed digital painting, expressive brushwork and a cohesive color palette.' },
  { id: '3d', label: '3D render', prompt: 'Polished 3D render, tactile materials, soft global illumination and sculptural depth.' },
  { id: 'pixel', label: 'Pixel art', prompt: 'Pixel art with deliberate clustered pixels, a limited palette and crisp silhouettes.' },
] as const

export type ImageStyleId = typeof IMAGE_STYLES[number]['id']

/** Only applied by an explicit editor action, never silently inside a request. */
export function applyImageStyle(prompt: string, style: ImageStyleId): string {
  const direction = IMAGE_STYLES.find((s) => s.id === style)?.prompt
  return direction ? `${prompt.trim()}\n\nStyle: ${direction}` : prompt
}
