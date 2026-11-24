import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  Character,
  Conversation,
  Message,
  Settings,
  ThemeId,
  World,
  WorldState,
} from '@/types'
import { DEFAULT_GLOBAL_PROMPT, DEFAULT_USER_PERSONA, PREVIOUS_DEFAULT_GLOBAL_PROMPT } from '@/lib/prompt'
import { DEFAULT_BASE_URL } from '@/lib/groq'
import { uid } from '@/lib/utils'
import { DEFAULT_THEME_PALETTES } from '@/data/palettes'
import { getApiKey, getCloudflareCredentials, getProviderKey, setApiKey } from '@/lib/credentials'
import { PROVIDER_PRESETS } from '@/lib/groq'
import { isLocalUrl } from '@/lib/platform'
import { deleteImages } from '@/lib/imageStorage'

function cleanupOrphanedImages(
  candidateImageIds: string[],
  activeConversations: Conversation[],
) {
  if (!candidateImageIds.length) return
  const stillReferenced = new Set<string>()
  for (const conv of activeConversations) {
    for (const msg of conv.messages) {
      if (msg.type === 'image' && msg.image?.id) {
        stillReferenced.add(msg.image.id)
      }
    }
  }
  const toDelete = candidateImageIds.filter((id) => !stillReferenced.has(id))
  if (toDelete.length > 0) {
    void deleteImages(toDelete)
  }
}

export const MIN_AGE = 18

/** Characters are adults only: any supplied age below 18 becomes 18, empty stays empty. */
export function normalizeAge(raw: string | undefined | null): string {
  const value = (raw ?? '').trim()
  if (!value) return ''
  const digits = value.match(/\d+/)
  if (!digits) return ''
  return String(Math.max(MIN_AGE, Number(digits[0])))
}

export interface UIState {
  settingsOpen: boolean
  settingsTab: 'connection' | 'appearance' | 'persona' | 'themes' | 'commands' | 'data' | 'about'
  characterModal: null | { tab: 'create' | 'browse' | 'generate'; editId?: string }
  worldModal: null | { tab: 'world' | 'cast'; editId?: string }
  sidebarOpen: boolean
  memoryOpen: boolean
  rightPanel: 'none' | 'reputation' | 'memory'
  welcomeOpen: boolean
  commandPaletteOpen: boolean
}

interface State {
  settings: Settings
  characters: Character[]
  worlds: World[]
  conversations: Conversation[]
  activeConversationId: string | null
  activeWorldId: string | null
  ui: UIState

  updateSettings: (patch: Partial<Settings>) => void
  setTheme: (theme: ThemeId) => void

  createCharacter: (
    input: Partial<Character> & { name: string; theme: ThemeId },
  ) => Character
  updateCharacter: (id: string, patch: Partial<Character>) => void
  deleteCharacter: (id: string) => void
  duplicateCharacter: (id: string) => Character | undefined

  createWorld: (input: Partial<World> & { name: string }) => World
  updateWorld: (id: string, patch: Partial<World>) => void
  deleteWorld: (id: string) => void
  setActiveWorld: (id: string | null) => void

  newConversation: (characterId: string, worldId?: string) => string
  focusOrCreateConversation: (characterId: string, worldId?: string) => string
  setActiveConversation: (id: string | null) => void
  renameConversation: (id: string, title: string) => void
  updateConversation: (id: string, patch: Partial<Conversation>) => void
  deleteConversation: (id: string) => void
  clearConversation: (id: string) => void
  togglePin: (id: string) => void

  addMessage: (conversationId: string, message: Message) => void
  updateMessage: (
    conversationId: string,
    messageId: string,
    patch: Partial<Message>,
  ) => void
  removeMessage: (conversationId: string, messageId: string) => void
  setMemory: (conversationId: string, memory: string) => void
  updateWorldState: (conversationId: string, patch: Partial<WorldState>) => void

  setUI: (patch: Partial<UIState>) => void
  replaceAll: (data: {
    settings?: Partial<Settings>
    characters?: Character[]
    worlds?: World[]
    conversations?: Conversation[]
  }) => void
}

export const DEFAULT_SETTINGS: Settings = {
  apiKey: '',
  baseUrl: DEFAULT_BASE_URL,
  model: 'openai/gpt-oss-20b',
  cachedModels: [],
  temperature: 0.85,
  maxTokens: 2048,
  topP: 1,
  globalSystemPrompt: DEFAULT_GLOBAL_PROMPT,
  userPersona: DEFAULT_USER_PERSONA,
  theme: 'chatbot',
  streaming: true,
  memoryEnabled: true,
  showThoughts: true,
  bubbleStyle: 'bubbles',
  onboarded: false,
  // Appearance & Design System
  appearanceMode: 'dark',
  accentPalette: 'gold',
  frostedGlass: true,
  customAccentColor: '#D4A359',
  customContrastColor: '#E5B869',
  themeAccents: {
    chatbot: { ...DEFAULT_THEME_PALETTES.chatbot },
    anime: { ...DEFAULT_THEME_PALETTES.anime },
    world: { ...DEFAULT_THEME_PALETTES.world },
  },
  // Keyed Providers & Capabilities
  keyedProviders: [],
  providerCapabilities: {
    google: { chat: true, image: true, tts: true },
    pollinations: { chat: true, image: true, tts: true },
    cloudflare: { chat: true, image: false, tts: false },
    groq: { chat: true, image: false, tts: false },
    openrouter: { chat: true, image: false, tts: false },
    ollamacloud: { chat: true, image: false, tts: false },
    openai: { chat: true, image: false, tts: false },
    ollama: { chat: true, image: false, tts: false },
    lmstudio: { chat: true, image: false, tts: false },
  },
  providerModels: {
    google: { chatModel: 'gemini-2.5-flash', imageModel: 'gemini-3.1-flash-image', ttsVoice: 'Puck' },
    pollinations: { chatModel: 'openai', imageModel: 'flux', ttsVoice: 'alloy' },
    cloudflare: { chatModel: '@cf/meta/llama-3.3-70b-instruct' },
  },
  chatDefault: { providerId: 'groq', model: 'openai/gpt-oss-20b' },
  imageDefault: { providerId: 'pollinations', model: 'flux' },
  ttsDefault: { providerId: 'pollinations', voice: 'alloy' },
  fallbackModel: { providerId: 'groq', model: 'openai/gpt-oss-20b' },
  chatProviderOrder: ['groq', 'google', 'openrouter', 'pollinations', 'cloudflare', 'ollamacloud', 'openai', 'ollama', 'lmstudio'],
  imageProviderOrder: ['pollinations', 'google'],
  ttsProviderOrder: ['pollinations', 'google'],
  ttsEnabled: true,
  ttsAutoRead: false,
  ttsReadNarration: false,
  allowCloudFallback: false,
}

const defaultUI: UIState = {
  settingsOpen: false,
  settingsTab: 'connection',
  characterModal: null,
  worldModal: null,
  sidebarOpen: false,
  memoryOpen: false,
  rightPanel: 'none',
  welcomeOpen: false,
  commandPaletteOpen: false,
}

function emptyWorldState(npc?: string): WorldState {
  return {
    reputation: npc ? { [npc]: 0 } : {},
    events: [],
    notes: '',
  }
}

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      settings: DEFAULT_SETTINGS,
      characters: [],
      worlds: [],
      conversations: [],
      activeConversationId: null,
      activeWorldId: null,
      ui: defaultUI,

      updateSettings: (patch) => {
        if (patch.apiKey !== undefined) {
          void setApiKey(patch.apiKey)
        }
        set((s) => {
          const nextSettings = { ...s.settings, ...patch }
          // If patch updates baseUrl or model, synchronize chatDefault so main controls take effect
          if (patch.baseUrl !== undefined || patch.model !== undefined) {
            const effectiveUrl = (nextSettings.baseUrl || '').trim()
            const preset = PROVIDER_PRESETS.find((p) => p.baseUrl === effectiveUrl)
            const providerId = preset?.id || (isLocalUrl(effectiveUrl) ? 'local-custom' : (nextSettings.chatDefault?.providerId || 'custom'))
            const model = nextSettings.model || nextSettings.chatDefault?.model || 'llama-3.1-8b-instant'
            nextSettings.chatDefault = {
              providerId,
              model,
            }
          }
          return { settings: nextSettings }
        })
      },

      setTheme: (theme) =>
        set((s) => {
          const firstConv = s.conversations
            .filter((c) => c.theme === theme)
            .sort((a, b) => b.updatedAt - a.updatedAt)[0]
          const savedAccent = s.settings.themeAccents?.[theme] ?? DEFAULT_THEME_PALETTES[theme]
          return {
            settings: {
              ...s.settings,
              theme,
              accentPalette: savedAccent?.paletteId ?? s.settings.accentPalette,
              customAccentColor: savedAccent?.primary ?? s.settings.customAccentColor,
              customContrastColor: savedAccent?.contrast ?? s.settings.customContrastColor,
            },
            activeConversationId: firstConv?.id ?? null,
            ui: { ...s.ui, sidebarOpen: false, rightPanel: 'none' },
          }
        }),

      createCharacter: (input) => {
        const character: Character = {
          id: uid('char'),
          theme: input.theme,
          name: input.name,
          avatar: input.avatar ?? '',
          avatarColor: input.avatarColor ?? '#7c5cff',
          tagline: input.tagline ?? '',
          description: input.description ?? '',
          gender: input.gender ?? '',
          age: normalizeAge(input.age),
          tags: input.tags ?? [],
          greeting: input.greeting ?? '',
          canon: input.canon ?? 'custom',
          source: input.source ?? '',
          overrides: input.overrides ?? '',
          worldId: input.worldId,
          metadata: input.metadata ?? [],
          createdAt: Date.now(),
        }
        set((s) => ({ characters: [...s.characters, character] }))
        return character
      },

      updateCharacter: (id, patch) =>
        set((s) => ({
          characters: s.characters.map((c) =>
            c.id === id
              ? {
                  ...c,
                  ...patch,
                  ...(patch.age !== undefined
                    ? { age: normalizeAge(patch.age) }
                    : {}),
                }
              : c,
          ),
        })),

      deleteCharacter: (id) => {
        set((s) => ({
          characters: s.characters.filter((c) => c.id !== id),
          conversations: s.conversations.filter((c) => c.characterId !== id),
          activeConversationId:
            s.conversations.find((c) => c.id === s.activeConversationId)
              ?.characterId === id
              ? null
              : s.activeConversationId,
        }))
      },

      duplicateCharacter: (id) => {
        const src = get().characters.find((c) => c.id === id)
        if (!src) return undefined
        const copy: Character = {
          ...src,
          id: uid('char'),
          name: `${src.name} (copy)`,
          createdAt: Date.now(),
        }
        set((s) => ({ characters: [...s.characters, copy] }))
        return copy
      },

      createWorld: (input) => {
        const world: World = {
          id: uid('world'),
          name: input.name,
          genre: input.genre ?? '',
          description: input.description ?? '',
          rules: input.rules ?? '',
          playerName: input.playerName ?? '',
          playerRole: input.playerRole ?? '',
          playerAppearance: input.playerAppearance ?? '',
          avatar: input.avatar ?? '🌍',
          avatarColor: input.avatarColor ?? '#34d399',
          locations: input.locations ?? '',
          factions: input.factions ?? '',
          lore: input.lore ?? '',
          color: input.color ?? '#34d399',
          createdAt: Date.now(),
        }
        set((s) => ({ worlds: [...s.worlds, world], activeWorldId: world.id }))
        return world
      },

      updateWorld: (id, patch) =>
        set((s) => ({
          worlds: s.worlds.map((w) => (w.id === id ? { ...w, ...patch } : w)),
        })),

      deleteWorld: (id) => {
        set((s) => ({
          worlds: s.worlds.filter((w) => w.id !== id),
          characters: s.characters.filter((c) => c.worldId !== id),
          conversations: s.conversations.filter((c) => c.worldId !== id),
          activeWorldId: s.activeWorldId === id ? null : s.activeWorldId,
          activeConversationId:
            s.conversations.find((c) => c.id === s.activeConversationId)
              ?.worldId === id
              ? null
              : s.activeConversationId,
        }))
      },

      setActiveWorld: (id) =>
        set((s) => ({
          activeWorldId: id,
          activeConversationId:
            s.activeConversationId &&
            s.conversations.find((c) => c.id === s.activeConversationId)
              ?.worldId === id
              ? s.activeConversationId
              : null,
        })),

      newConversation: (characterId, worldId) => {
        const character = get().characters.find((c) => c.id === characterId)
        const resolvedWorldId = worldId ?? character?.worldId
        const cast = resolvedWorldId
          ? get().characters.filter((c) => c.worldId === resolvedWorldId)
          : []
        const seedReputation: Record<string, number> = {}
        for (const member of cast) seedReputation[member.name] = 0
        if (character && !(character.name in seedReputation)) {
          seedReputation[character.name] = 0
        }
        const id = uid('conv')
        const messages: Message[] = []
        if (character?.greeting?.trim()) {
          messages.push({
            id: uid('msg'),
            role: 'assistant',
            content: character.greeting.trim(),
            timestamp: Date.now(),
          })
        }
        const conversation: Conversation = {
          id,
          theme: character?.theme ?? 'chatbot',
          characterId,
          worldId: resolvedWorldId,
          title: character?.name ?? 'New chat',
          messages,
          memory: '',
          worldState:
            character && (character.theme === 'world' || resolvedWorldId)
              ? { reputation: seedReputation, events: [], notes: '' }
              : undefined,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }
        set((s) => ({
          conversations: [conversation, ...s.conversations],
          activeConversationId: id,
          ui: { ...s.ui, sidebarOpen: false },
        }))
        return id
      },

      focusOrCreateConversation: (characterId, worldId) => {
        const existing = get().conversations.find(
          (c) =>
            c.characterId === characterId &&
            (worldId ? c.worldId === worldId : true),
        )
        if (existing) {
          set((s) => ({
            activeConversationId: existing.id,
            ui: { ...s.ui, sidebarOpen: false },
          }))
          return existing.id
        }
        return get().newConversation(characterId, worldId)
      },

      setActiveConversation: (id) =>
        set((s) => ({
          activeConversationId: id,
          ui: { ...s.ui, sidebarOpen: false, rightPanel: 'none' },
        })),

      renameConversation: (id, title) =>
        set((s) => ({
          conversations: s.conversations.map((c) =>
            c.id === id ? { ...c, title } : c,
          ),
        })),

      updateConversation: (id, patch) =>
        set((s) => ({
          conversations: s.conversations.map((c) =>
            c.id === id ? { ...c, ...patch, updatedAt: Date.now() } : c,
          ),
        })),

      deleteConversation: (id) => {
        const state = get()
        const target = state.conversations.find((c) => c.id === id)
        const imageIds: string[] = []
        if (target) {
          for (const m of target.messages) {
            if (m.type === 'image' && m.image?.id) imageIds.push(m.image.id)
          }
        }
        const remaining = state.conversations.filter((c) => c.id !== id)
        set(() => ({
          conversations: remaining,
          activeConversationId:
            state.activeConversationId === id ? null : state.activeConversationId,
        }))
        cleanupOrphanedImages(imageIds, remaining)
      },

      clearConversation: (id) => {
        const state = get()
        const target = state.conversations.find((c) => c.id === id)
        const imageIds: string[] = []
        if (target) {
          const preserved = target.messages.filter((m) => m.role === 'assistant').slice(0, 1)
          const preservedSet = new Set(preserved.map((m) => m.id))
          for (const m of target.messages) {
            if (!preservedSet.has(m.id) && m.type === 'image' && m.image?.id) {
              imageIds.push(m.image.id)
            }
          }
        }
        const updated = state.conversations.map((c) =>
          c.id === id
            ? {
                ...c,
                messages: c.messages.filter((m) => m.role === 'assistant').slice(0, 1),
                memory: '',
                updatedAt: Date.now(),
              }
            : c,
        )
        set(() => ({ conversations: updated }))
        cleanupOrphanedImages(imageIds, updated)
      },

      togglePin: (id) =>
        set((s) => ({
          conversations: s.conversations.map((c) =>
            c.id === id ? { ...c, pinned: !c.pinned } : c,
          ),
        })),

      addMessage: (conversationId, message) =>
        set((s) => ({
          conversations: s.conversations.map((c) =>
            c.id === conversationId
              ? {
                  ...c,
                  messages: [...c.messages, message],
                  updatedAt: Date.now(),
                  title:
                    c.messages.filter((m) => m.role === 'user').length === 0 &&
                    message.role === 'user'
                      ? message.content.slice(0, 42) || c.title
                      : c.title,
                }
              : c,
          ),
        })),

      updateMessage: (conversationId, messageId, patch) =>
        set((s) => ({
          conversations: s.conversations.map((c) =>
            c.id === conversationId
              ? {
                  ...c,
                  messages: c.messages.map((m) =>
                    m.id === messageId ? { ...m, ...patch } : m,
                  ),
                  updatedAt: Date.now(),
                }
              : c,
          ),
        })),

      removeMessage: (conversationId, messageId) => {
        const state = get()
        const conv = state.conversations.find((c) => c.id === conversationId)
        const msg = conv?.messages.find((m) => m.id === messageId)
        const imageId = (msg?.type === 'image' && msg.image?.id) ? msg.image.id : null

        const updated = state.conversations.map((c) =>
          c.id === conversationId
            ? {
                ...c,
                messages: c.messages.filter((m) => m.id !== messageId),
              }
            : c,
        )
        set(() => ({ conversations: updated }))
        if (imageId) {
          cleanupOrphanedImages([imageId], updated)
        }
      },

      setMemory: (conversationId, memory) =>
        set((s) => ({
          conversations: s.conversations.map((c) =>
            c.id === conversationId ? { ...c, memory } : c,
          ),
        })),

      updateWorldState: (conversationId, patch) =>
        set((s) => ({
          conversations: s.conversations.map((c) =>
            c.id === conversationId
              ? {
                  ...c,
                  worldState: {
                    ...(c.worldState ?? emptyWorldState()),
                    ...patch,
                  },
                }
              : c,
          ),
        })),

      setUI: (patch) => set((s) => ({ ui: { ...s.ui, ...patch } })),

      replaceAll: (data) =>
        set((s) => {
          const nextSettings = { ...s.settings, ...(data.settings ?? {}) }
          // Guard: Never silently overwrite a valid active API key with an empty imported value
          if (data.settings && (data.settings.apiKey === '' || data.settings.apiKey === undefined)) {
            nextSettings.apiKey = s.settings.apiKey
          } else if (data.settings?.apiKey) {
            void setApiKey(data.settings.apiKey)
          }
          return {
            settings: nextSettings,
            characters: data.characters
              ? data.characters.map((c: Character) => ({
                  ...c,
                  age: normalizeAge(c.age),
                }))
              : s.characters,
            worlds: data.worlds ?? s.worlds,
            conversations: data.conversations ?? s.conversations,
          }
        }),
    }),
    {
      name: 'nexus-chat-store',
      version: 7,
      migrate: (persisted: any) => {
        if (persisted?.settings) {
          if (!persisted.settings.appearanceMode) persisted.settings.appearanceMode = 'dark'
          if (!persisted.settings.accentPalette) persisted.settings.accentPalette = 'gold'
          if (persisted.settings.frostedGlass === undefined) persisted.settings.frostedGlass = true
          if (!persisted.settings.customAccentColor) persisted.settings.customAccentColor = '#D4A359'
          if (!persisted.settings.customContrastColor) persisted.settings.customContrastColor = '#E5B869'
          if (!persisted.settings.themeAccents) {
            persisted.settings.themeAccents = {
              chatbot: { ...DEFAULT_THEME_PALETTES.chatbot },
              anime: { ...DEFAULT_THEME_PALETTES.anime },
              world: { ...DEFAULT_THEME_PALETTES.world },
            }
          }
        }
        if (persisted?.settings?.globalSystemPrompt === PREVIOUS_DEFAULT_GLOBAL_PROMPT) {
          persisted.settings.globalSystemPrompt = DEFAULT_GLOBAL_PROMPT
        }
        if (persisted?.settings?.model === 'openai/gpt-oss-safeguard-20b') {
          persisted.settings.model = DEFAULT_SETTINGS.model
        }
        // Llama is no longer offered, so anyone sitting on one moves to the default.
        if (persisted?.settings && /llama/i.test(String(persisted.settings.model ?? ''))) {
          persisted.settings.model = DEFAULT_SETTINGS.model
        }
        if (persisted?.settings && !persisted.settings.baseUrl) {
          persisted.settings.baseUrl = DEFAULT_BASE_URL
        }
        if (persisted?.settings && !Array.isArray(persisted.settings.cachedModels)) {
          persisted.settings.cachedModels = []
        }
        // Version 7 settings migration
        if (persisted?.settings) {
          if (!Array.isArray(persisted.settings.keyedProviders)) {
            persisted.settings.keyedProviders = []
          }
          if (!persisted.settings.providerCapabilities) {
            persisted.settings.providerCapabilities = { ...DEFAULT_SETTINGS.providerCapabilities }
          }
          if (!persisted.settings.providerModels) {
            persisted.settings.providerModels = { ...DEFAULT_SETTINGS.providerModels }
          }
          if (!persisted.settings.chatDefault) {
            persisted.settings.chatDefault = {
              providerId: 'groq',
              model: persisted.settings.model || DEFAULT_SETTINGS.model,
            }
          }
          if (!persisted.settings.imageDefault) {
            persisted.settings.imageDefault = { ...DEFAULT_SETTINGS.imageDefault }
          }
          if (!persisted.settings.ttsDefault) {
            persisted.settings.ttsDefault = { ...DEFAULT_SETTINGS.ttsDefault }
          }
          if (!persisted.settings.fallbackModel) {
            persisted.settings.fallbackModel = { ...DEFAULT_SETTINGS.fallbackModel }
          }
          if (!persisted.settings.chatProviderOrder) {
            persisted.settings.chatProviderOrder = [...DEFAULT_SETTINGS.chatProviderOrder]
          }
          if (!persisted.settings.imageProviderOrder) {
            persisted.settings.imageProviderOrder = [...DEFAULT_SETTINGS.imageProviderOrder]
          }
          if (!persisted.settings.ttsProviderOrder) {
            persisted.settings.ttsProviderOrder = [...DEFAULT_SETTINGS.ttsProviderOrder]
          }
          if (persisted.settings.ttsEnabled === undefined) persisted.settings.ttsEnabled = true
          if (persisted.settings.ttsAutoRead === undefined) persisted.settings.ttsAutoRead = false
          if (persisted.settings.ttsReadNarration === undefined) persisted.settings.ttsReadNarration = false
          if (persisted.settings.allowCloudFallback === undefined) persisted.settings.allowCloudFallback = false
        }
        // Version 7 conversation migration: old chats get null for chatConfig, imageConfig, ttsConfig
        if (Array.isArray(persisted?.conversations)) {
          persisted.conversations = persisted.conversations.map((c: any) => ({
            ...c,
            chatConfig: c.chatConfig ?? null,
            imageConfig: c.imageConfig ?? null,
            ttsConfig: c.ttsConfig ?? null,
          }))
        }
        // Only a genuinely fresh install should see the welcome tour.
        if (persisted?.settings && persisted.settings.onboarded === undefined) {
          persisted.settings.onboarded =
            (persisted.characters?.length ?? 0) > 0 ||
            (persisted.conversations?.length ?? 0) > 0 ||
            !!(persisted.settings.apiKey ?? '').trim()
        }
        // Migrate legacy unencrypted API key from local storage to secure credential storage
        if (persisted?.settings?.apiKey) {
          void setApiKey(persisted.settings.apiKey)
          persisted.settings.apiKey = ''
        }
        // Characters are adults only (18+). Clamp anything saved as a minor.
        if (Array.isArray(persisted?.characters)) {
          persisted.characters = persisted.characters.map((c: Character) =>
            c && c.age ? { ...c, age: normalizeAge(c.age) } : c,
          )
        }
        return persisted
      },
      partialize: (s) => ({
        settings: {
          ...s.settings,
          apiKey: '', // Never persist API keys in plaintext local storage
        },
        characters: s.characters,
        worlds: s.worlds,
        conversations: s.conversations,
        activeConversationId: s.activeConversationId,
        activeWorldId: s.activeWorldId,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          void getApiKey().then((storedKey) => {
            if (storedKey && !state.settings.apiKey) {
              state.updateSettings({ apiKey: storedKey })
            }
          })

          // Populate keyedProviders based on platform secure storage
          void Promise.all(
            PROVIDER_PRESETS.map(async (p) => {
              if (p.id === 'cloudflare') {
                const creds = await getCloudflareCredentials()
                return creds.accountId && creds.apiToken ? 'cloudflare' : null
              }
              if (p.id === 'ollama' || p.id === 'lmstudio') {
                return null
              }
              const k = await getProviderKey(p.id)
              return k ? p.id : null
            }),
          ).then((ids) => {
            const validIds = ids.filter(Boolean) as string[]
            if (validIds.length > 0) {
              const current = state.settings.keyedProviders || []
              const merged = Array.from(new Set([...current, ...validIds]))
              state.updateSettings({ keyedProviders: merged })
            }
          })
        }
      },
    },
  ),
)

export const emptyWorldStateFor = emptyWorldState
