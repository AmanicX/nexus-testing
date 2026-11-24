import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { chatGroq } from '@/lib/groq'
import { DEFAULT_SETTINGS } from '@/store/useStore'
import type { Conversation } from '@/types'
import { generateImageConcepts, expandImageIdea, getPromptWriters } from '@/lib/imagePromptGenerator'

vi.mock('@/lib/groq', async (original) => ({
  ...await original<typeof import('@/lib/groq')>(), chatGroq: vi.fn(),
}))
vi.mock('@/lib/credentials', () => ({
  getProviderKey: vi.fn().mockResolvedValue('test-key'),
  getCloudflareCredentials: vi.fn(),
}))
const concepts = [
  { title: 'Kite Workshop', subject: 'paper kite construction', prompt: 'Top-down paper kite construction on a wooden workbench, bright spools and scissors, soft daylight.' },
  { title: 'Quiet Picnic', subject: 'lakeside picnic food', prompt: 'A basket of fruit and sandwiches on a gingham blanket beside a lake, an inviting close-up food photograph.' },
  { title: 'Flight Mechanics', subject: 'flight diagram', prompt: 'An educational cutaway diagram explaining lift and wind direction, arrows over a clean white background.' },
  { title: 'Wind Runner', subject: 'runner portrait', prompt: 'A joyful child in a yellow coat running across an open grassy hill, dynamic portrait with loose expressive brushwork.' },
]
const settings = {
  ...DEFAULT_SETTINGS, keyedProviders: ['groq'],
  providerModels: { groq: { chatModel: 'openai/gpt-oss-120b' } },
}
const conversation: Conversation = {
  id: 'active', title: 'PRIVATE TITLE', memory: 'PRIVATE MEMORY', characterId: 'private-character',
  theme: 'chatbot', createdAt: 0, updatedAt: 0,
  messages: ['OLD SECRET', 'OLDER SECRET', 'Building a kite.', 'A lake would be nice.', 'Let us plan the picnic.'].map((content, i) => ({
    id: String(i), role: i % 2 ? 'assistant' : 'user', content, timestamp: i,
  })),
}
beforeEach(() => { vi.mocked(chatGroq).mockResolvedValue(JSON.stringify(concepts)) })
afterEach(() => { vi.clearAllMocks(); vi.restoreAllMocks() })

describe('Image Gen prompt context and quality', () => {
  it('sends only the latest three active messages, never memory, metadata or older history', async () => {
    expect(await generateImageConcepts({ mode: 'chat', conversation, settings })).toHaveLength(4)
    const sent = JSON.stringify(vi.mocked(chatGroq).mock.calls[0][0].messages)
    expect(sent).toContain('Building a kite.')
    expect(sent).toContain('Let us plan the picnic.')
    expect(sent).not.toMatch(/SECRET|PRIVATE|private-character/)
  })

  it('uses a stronger configured writer without inventing a model', async () => {
    const writers = getPromptWriters(settings)
    expect(writers[0].model).toBe('openai/gpt-oss-120b')
    await generateImageConcepts({ mode: 'chat', conversation, settings })
    expect(vi.mocked(chatGroq).mock.calls[0][0].model).toBe('openai/gpt-oss-120b')
  })

  it('keeps standalone ideas completely independent of chat', async () => {
    await generateImageConcepts({ mode: 'standalone', idea: 'colorful birds', settings })
    const sent = JSON.stringify(vi.mocked(chatGroq).mock.calls[0][0].messages)
    expect(sent).toContain('colorful birds')
    expect(sent).not.toContain('picnic')
    expect(sent).not.toContain('PRIVATE')
  })

  it('can invent four standalone concepts without a seed', async () => {
    expect(await generateImageConcepts({ mode: 'standalone', settings })).toHaveLength(4)
  })

  it('expands one short idea without needing a conversation', async () => {
    vi.mocked(chatGroq).mockResolvedValue(JSON.stringify({ prompt: 'A vivid red kite flying above a quiet lake, framed from below with clear daylight.' }))
    expect(await expandImageIdea({ idea: 'kite at a lake', settings })).toContain('red kite')
  })

  it('displays expand-specific error instead of four-concepts error on malformed expansion response', async () => {
    vi.mocked(chatGroq).mockResolvedValue('not valid json')
    await expect(expandImageIdea({ idea: 'kite at a lake', settings })).rejects.toThrow(
      'The prompt writer must return a valid expanded image prompt. Try another writer or edit a manual prompt.'
    )
  })

  it('retries expansion once with targeted instruction on invalid structure before failing', async () => {
    vi.mocked(chatGroq).mockResolvedValue(JSON.stringify({ wrongField: 'no prompt key' }))
    await expect(expandImageIdea({ idea: 'kite at a lake', settings })).rejects.toThrow(
      'The prompt writer must return a valid expanded image prompt. Try another writer or edit a manual prompt.'
    )
    expect(chatGroq).toHaveBeenCalledTimes(2)
    const retryMsg = vi.mocked(chatGroq).mock.calls[1][0].messages[0].content
    expect(retryMsg).toContain('return a single polished prompt')
  })

  it.each([
    concepts.slice(0, 3),
    [...concepts, concepts[0]],
    concepts.map(() => concepts[0]),
    [{ title: 123, prompt: {} }, ...concepts.slice(1)],
  ])('rejects wrong counts, duplicate concepts and invalid shapes after one repair', async (items) => {
    vi.mocked(chatGroq).mockResolvedValue(JSON.stringify(items))
    await expect(generateImageConcepts({ mode: 'standalone', settings })).rejects.toThrow(/four|different|valid/i)
    expect(chatGroq).toHaveBeenCalledTimes(2)
  })

  it('repairs malformed JSON once without returning a partial batch', async () => {
    vi.mocked(chatGroq).mockResolvedValueOnce('not json')
    expect(await generateImageConcepts({ mode: 'standalone', settings })).toHaveLength(4)
    expect(chatGroq).toHaveBeenCalledTimes(2)
  })

  it('never retries network/credential errors', async () => {
    vi.mocked(chatGroq).mockRejectedValue(new Error('Network failed'))
    await expect(generateImageConcepts({ mode: 'standalone', settings })).rejects.toThrow()
    expect(chatGroq).toHaveBeenCalledTimes(1)
  })

  it('never retries or accepts a late result after cancellation', async () => {
    const controller = new AbortController()
    vi.mocked(chatGroq).mockImplementation(async () => {
      controller.abort()
      return JSON.stringify(concepts)
    })
    await expect(generateImageConcepts({ mode: 'standalone', settings, signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' })
    expect(chatGroq).toHaveBeenCalledTimes(1)
  })

  it('keeps a local primary local even when stronger cloud writers are configured', () => {
    const writers = getPromptWriters({
      ...settings, chatDefault: { providerId: 'ollama', model: 'local-model' },
      allowCloudFallback: false,
    })
    expect(writers.length).toBeGreaterThan(0)
    expect(writers.every((w) => w.providerId === 'ollama')).toBe(true)
  })
})
