import { useEffect, useRef, useState } from 'react'
import {
  AlertCircle,
  ArrowLeft,
  Check,
  Cpu,
  Database,
  Download,
  Eye,
  EyeOff,
  ExternalLink,
  Globe2,
  KeyRound,
  Laptop,
  MessageSquare,
  Moon,
  Palette,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  Sliders,
  Sparkles,
  Sun,
  Terminal,
  Trash2,
  Upload,
  User,
  Wand2,
  X,
  Zap,
} from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useStore } from '@/store/useStore'
import {
  GROQ_MODELS,
  PROVIDER_PRESETS,
  DEFAULT_BASE_URL,
  MODEL_SUGGESTIONS,
  listGroqModels,
  providerNeedsKey,
  presetIdFor,
  suggestionsFor,
} from '@/lib/groq'
import {
  getProviderKey,
  setProviderKey,
  getCloudflareCredentials,
  setCloudflareCredentials,
} from '@/lib/credentials'
import { GOOGLE_TTS_VOICES, POLLINATIONS_TTS_VOICES } from '@/lib/tts'
import { GOOGLE_IMAGE_MODELS, POLLINATIONS_IMAGE_MODELS } from '@/lib/imageGeneration'
import {
  isMobilePlatform,
  isLocalProvider,
  getSupportedProviderPresets,
  isLocalUrl,
  useIsDesktopLayout,
  isDesktopPlatform,
} from '@/lib/platform'
import { DoneButton } from './DoneButton'
import { THEMES, THEME_ORDER } from '@/data/themes'
import { AppLogo } from './AppLogo'
import {
  CURATED_PALETTES,
  DEFAULT_THEME_PALETTES,
  applyThemeTokens,
  deriveContrastColor,
  isValidHex,
} from '@/data/palettes'
import { Modal } from './Modal'
import { CommandCheatsheet } from './CommandCheatsheet'
import { cn, clamp, download } from '@/lib/utils'
import type { AppearanceMode } from '@/types'
import type { UIState } from '@/store/useStore'

export interface SettingsTabItem {
  id: UIState['settingsTab']
  label: string
  desc: string
  headerDesc: string
  icon: React.ReactNode
  category: 'studio' | 'tools' | 'system'
}

const TABS: SettingsTabItem[] = [
  {
    id: 'appearance',
    label: 'Appearance',
    desc: 'Themes, accent palettes & glass',
    headerDesc: 'Customize visual theme, accent colors, contrast ratios, and frosted glass transparency.',
    icon: <Palette size={16} />,
    category: 'studio',
  },
  {
    id: 'connection',
    label: 'Connection',
    desc: 'AI providers, models & fallback',
    headerDesc: 'Configure active model endpoint, API credentials, streaming parameters, and automatic fallback failover.',
    icon: <KeyRound size={16} />,
    category: 'studio',
  },
  {
    id: 'persona',
    label: 'Persona',
    desc: 'User identity, name & tone',
    headerDesc: 'Define your username, personal backstory, and customized roleplay guidelines for character conversations.',
    icon: <User size={16} />,
    category: 'studio',
  },
  {
    id: 'themes',
    label: 'Modes',
    desc: 'Chatbot, Anime & World studios',
    headerDesc: 'Switch active creative studio environment between Chatbot, Anime Character, and Interactive World simulation.',
    icon: <Sparkles size={16} />,
    category: 'studio',
  },
  {
    id: 'commands',
    label: 'Commands',
    desc: 'Scene syntax & quick reference',
    headerDesc: 'Reference list for story scene syntax, dice rolling, narration directives, and character prompt commands.',
    icon: <Terminal size={16} />,
    category: 'tools',
  },
  {
    id: 'data',
    label: 'Data',
    desc: 'Backups, export & storage usage',
    headerDesc: 'Export zero-knowledge JSON backups, restore saved databases, or reset local application storage.',
    icon: <Database size={16} />,
    category: 'tools',
  },
  {
    id: 'about',
    label: 'About & Legal',
    desc: 'Eva v2.2.0, terms & license',
    headerDesc: 'Application version, open-source software licenses, terms of service, and official project links.',
    icon: <ShieldCheck size={16} />,
    category: 'system',
  },
]

const CATEGORIES = [
  { id: 'studio', label: 'Studio & AI', tabs: TABS.filter((t) => t.category === 'studio') },
  { id: 'tools', label: 'Tools & Data', tabs: TABS.filter((t) => t.category === 'tools') },
  { id: 'system', label: 'System', tabs: TABS.filter((t) => t.category === 'system') },
] as const

export function SettingsModal() {
  const settings = useStore((s) => s.settings)
  const ui = useStore((s) => s.ui)
  const updateSettings = useStore((s) => s.updateSettings)
  const setUI = useStore((s) => s.setUI)
  const setTheme = useStore((s) => s.setTheme)
  const characters = useStore((s) => s.characters)
  const conversations = useStore((s) => s.conversations)
  const worlds = useStore((s) => s.worlds)
  const replaceAll = useStore((s) => s.replaceAll)

  const open = ui.settingsOpen
  const tab = ui.settingsTab
  const [showKey, setShowKey] = useState(false)
  const [testState, setTestState] = useState<'idle' | 'testing' | 'ok' | 'fail'>('idle')
  const [testMsg, setTestMsg] = useState('')
  const [modelFilter, setModelFilter] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const [providerKeys, setProviderKeys] = useState<Record<string, string>>({})
  const [savedKeys, setSavedKeys] = useState<Record<string, string>>({})
  const [cfAccountId, setCfAccountId] = useState('')
  const [cfApiToken, setCfApiToken] = useState('')
  const [savedCfAccountId, setSavedCfAccountId] = useState('')
  const [savedCfApiToken, setSavedCfApiToken] = useState('')

  const needsKey = providerNeedsKey(settings.baseUrl)
  const isMobile = isMobilePlatform()
  const supportedPresets = getSupportedProviderPresets(PROVIDER_PRESETS, isMobile)
  const activePreset = PROVIDER_PRESETS.find((p) => p.baseUrl === settings.baseUrl.trim())
  const presetId = presetIdFor(settings.baseUrl)
  const isCurrentLocal = isLocalProvider(presetId || activePreset?.id) || isLocalUrl(settings.baseUrl)
  const curated = GROQ_MODELS.find((m) => m.id === settings.model)
  const hasGoogleKey = settings.keyedProviders.includes('google')

  useEffect(() => {
    if (!open) return
    const provId = activePreset?.id || 'groq'
    if (provId === 'cloudflare') {
      void getCloudflareCredentials().then((creds) => {
        setCfAccountId(creds.accountId)
        setSavedCfAccountId(creds.accountId)
        setCfApiToken(creds.apiToken)
        setSavedCfApiToken(creds.apiToken)
      })
    } else {
      void getProviderKey(provId).then((k) => {
        const keyVal = k || (provId === 'groq' ? settings.apiKey : '')
        setProviderKeys((prev) => ({ ...prev, [provId]: keyVal }))
        setSavedKeys((prev) => ({ ...prev, [provId]: keyVal }))
      })
    }
  }, [open, activePreset?.id, settings.apiKey])

  const modelOptions = Array.from(
    new Set([
      ...suggestionsFor(settings.baseUrl),
      ...settings.cachedModels,
      ...GROQ_MODELS.map((m) => m.id),
      settings.model,
    ]),
  ).filter(Boolean)
  const shownModels = modelOptions.filter((m) =>
    m.toLowerCase().includes(modelFilter.trim().toLowerCase()),
  )

  const testConnection = async () => {
    if (needsKey && !settings.apiKey.trim()) {
      setTestState('fail')
      setTestMsg('Add an API key first.')
      return
    }
    setTestState('testing')
    setTestMsg('')
    try {
      const list = await listGroqModels(settings.apiKey, settings.baseUrl)
      updateSettings({ cachedModels: list })
      setTestState('ok')
      setTestMsg(`Connected successfully · ${list.length} models available`)
    } catch (e) {
      setTestState('fail')
      setTestMsg(e instanceof Error ? e.message : 'Connection failed')
    }
  }

  const exportData = () => {
    // SECURITY: Strip sensitive credentials before exporting backups
    const sanitizedSettings = { ...settings, apiKey: '' }
    download(
      `eva-backup-${new Date().toISOString().slice(0, 10)}.json`,
      JSON.stringify({ settings: sanitizedSettings, characters, worlds, conversations }, null, 2),
    )
  }

  const importData = async (file: File) => {
    try {
      const text = await file.text()
      const parsed = JSON.parse(text)
      if (parsed?.settings) {
        if (!parsed.settings.apiKey) {
          // Preserve existing active API key if backup does not contain one
          parsed.settings.apiKey = settings.apiKey
        } else if (settings.apiKey && parsed.settings.apiKey !== settings.apiKey) {
          // If backup contains a different API key, confirm with user before overwriting
          const shouldOverwrite = window.confirm(
            'The backup file contains an API key. Would you like to overwrite your active API key with the one from the backup?'
          )
          if (!shouldOverwrite) {
            parsed.settings.apiKey = settings.apiKey
          }
        }
      }
      replaceAll(parsed)
    } catch {
      alert('Could not read that backup file.')
    }
  }

  // Appearance handlers
  const handleModeChange = (mode: AppearanceMode) => {
    updateSettings({ appearanceMode: mode })
    applyThemeTokens(
      mode,
      settings.theme,
      settings.customAccentColor,
      settings.customContrastColor,
      settings.frostedGlass,
    )
  }

  const handlePaletteSelect = (paletteId: string) => {
    const p = CURATED_PALETTES.find((pal) => pal.id === paletteId)
    if (!p) return
    const nextAccents = {
      ...settings.themeAccents,
      [settings.theme]: { paletteId: p.id, primary: p.primary, contrast: p.contrast },
    }
    updateSettings({
      accentPalette: p.id,
      customAccentColor: p.primary,
      customContrastColor: p.contrast,
      themeAccents: nextAccents,
    })
    applyThemeTokens(settings.appearanceMode, settings.theme, p.primary, p.contrast, settings.frostedGlass)
  }

  const handleCustomPrimary = (hex: string) => {
    const nextAccents = {
      ...settings.themeAccents,
      [settings.theme]: {
        paletteId: 'custom',
        primary: hex,
        contrast: settings.customContrastColor,
      },
    }
    updateSettings({
      accentPalette: 'custom',
      customAccentColor: hex,
      themeAccents: nextAccents,
    })
    if (isValidHex(hex)) {
      applyThemeTokens(
        settings.appearanceMode,
        settings.theme,
        hex,
        settings.customContrastColor,
        settings.frostedGlass,
      )
    }
  }

  const handleCustomContrast = (hex: string) => {
    const nextAccents = {
      ...settings.themeAccents,
      [settings.theme]: {
        paletteId: 'custom',
        primary: settings.customAccentColor,
        contrast: hex,
      },
    }
    updateSettings({
      accentPalette: 'custom',
      customContrastColor: hex,
      themeAccents: nextAccents,
    })
    if (isValidHex(hex)) {
      applyThemeTokens(
        settings.appearanceMode,
        settings.theme,
        settings.customAccentColor,
        hex,
        settings.frostedGlass,
      )
    }
  }

  const handleAutoDeriveContrast = () => {
    const contrast = deriveContrastColor(settings.customAccentColor)
    handleCustomContrast(contrast)
  }

  const handleResetThemeDefaults = () => {
    const defaultPalette = DEFAULT_THEME_PALETTES[settings.theme] || DEFAULT_THEME_PALETTES.chatbot
    const nextAccents = {
      ...settings.themeAccents,
      [settings.theme]: { ...defaultPalette },
    }
    updateSettings({
      accentPalette: defaultPalette.paletteId,
      customAccentColor: defaultPalette.primary,
      customContrastColor: defaultPalette.contrast,
      themeAccents: nextAccents,
    })
    applyThemeTokens(
      settings.appearanceMode,
      settings.theme,
      defaultPalette.primary,
      defaultPalette.contrast,
      settings.frostedGlass,
    )
  }

  const handleFrostedToggle = (enabled: boolean) => {
    updateSettings({ frostedGlass: enabled })
    applyThemeTokens(
      settings.appearanceMode,
      settings.theme,
      settings.customAccentColor,
      settings.customContrastColor,
      enabled,
    )
  }

  const isDesktopLayout = useIsDesktopLayout()
  const isDesktop = isDesktopPlatform()

  useEffect(() => {
    if (!open) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        setUI({ settingsOpen: false })
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, setUI])

  const currentTab = TABS.find((t) => t.id === tab) || TABS[0]

  const renderTabContent = (currentTabId: UIState['settingsTab']) => {
    switch (currentTabId) {
      case 'appearance':
        return (
            <div className="space-y-6">
              {/* Appearance Mode */}
              <Section
                title="Appearance Mode"
                icon={<Sun size={15} />}
                hint="Astra warm dark, clean minimal light, or automatically match your operating system theme."
              >
                <div className="seg grid w-full grid-cols-3">
                  <button
                    data-active={settings.appearanceMode === 'dark'}
                    onClick={() => handleModeChange('dark')}
                    className="flex items-center justify-center gap-2"
                  >
                    <Moon size={15} /> Dark
                  </button>
                  <button
                    data-active={settings.appearanceMode === 'light'}
                    onClick={() => handleModeChange('light')}
                    className="flex items-center justify-center gap-2"
                  >
                    <Sun size={15} /> Light
                  </button>
                  <button
                    data-active={settings.appearanceMode === 'system'}
                    onClick={() => handleModeChange('system')}
                    className="flex items-center justify-center gap-2"
                  >
                    <Zap size={15} /> System
                  </button>
                </div>
              </Section>

              {/* Accent Themes */}
              <Section
                title="Accent Palette"
                icon={<Sparkles size={15} />}
                hint={`Active for ${THEMES[settings.theme].name} mode. Eva remembers accent colors per mode.`}
              >
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {CURATED_PALETTES.map((p) => {
                    const active = settings.accentPalette === p.id
                    return (
                      <button
                        key={p.id}
                        onClick={() => handlePaletteSelect(p.id)}
                        className={cn(
                          'flex items-center gap-2.5 rounded-xl border p-2.5 text-left text-xs transition',
                          active
                            ? 'border-accent bg-accent/10 text-fg font-semibold'
                            : 'border-border bg-surface hover:bg-surface-2 text-muted',
                        )}
                      >
                        <div className="flex -space-x-1.5 shrink-0">
                          <span
                            className="size-4 rounded-full border border-black/20 shadow-sm"
                            style={{ backgroundColor: p.primary }}
                          />
                          <span
                            className="size-4 rounded-full border border-black/20 shadow-sm"
                            style={{ backgroundColor: p.contrast }}
                          />
                        </div>
                        <span className="truncate">{p.label}</span>
                        {active && <Check size={14} className="ml-auto text-accent shrink-0" />}
                      </button>
                    )
                  })}
                  <button
                    onClick={() => updateSettings({ accentPalette: 'custom' })}
                    className={cn(
                      'flex items-center gap-2.5 rounded-xl border p-2.5 text-left text-xs transition',
                      settings.accentPalette === 'custom'
                        ? 'border-accent bg-accent/10 text-fg font-semibold'
                        : 'border-border bg-surface hover:bg-surface-2 text-muted',
                    )}
                  >
                    <Palette size={16} className="text-accent shrink-0" />
                    <span>Custom</span>
                    {settings.accentPalette === 'custom' && (
                      <Check size={14} className="ml-auto text-accent shrink-0" />
                    )}
                  </button>
                </div>
              </Section>

              {/* Custom Accent & Contrast Picker */}
              <Section
                title="Custom Colors & Contrast"
                icon={<Palette size={15} />}
                hint="Fine-tune your 10% primary accent and its complementary secondary contrast."
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  {/* Primary Accent */}
                  <div className="rounded-xl border border-border bg-surface p-3 space-y-2">
                    <span className="text-xs font-medium text-muted block">Primary Accent</span>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={settings.customAccentColor}
                        onChange={(e) => handleCustomPrimary(e.target.value)}
                        className="size-8 rounded-lg cursor-pointer border-0 bg-transparent p-0"
                      />
                      <input
                        type="text"
                        value={settings.customAccentColor}
                        onChange={(e) => handleCustomPrimary(e.target.value)}
                        placeholder="#0a84ff"
                        className="field font-mono text-xs uppercase"
                        maxLength={7}
                      />
                    </div>
                  </div>

                  {/* Contrast Accent */}
                  <div className="rounded-xl border border-border bg-surface p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-muted">Contrast Color</span>
                      <button
                        onClick={handleAutoDeriveContrast}
                        className="flex items-center gap-1 text-2xs text-accent hover:underline"
                        title="Calculate harmonious analogous contrast"
                      >
                        <Wand2 size={12} /> Auto-derive
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={settings.customContrastColor}
                        onChange={(e) => handleCustomContrast(e.target.value)}
                        className="size-8 rounded-lg cursor-pointer border-0 bg-transparent p-0"
                      />
                      <input
                        type="text"
                        value={settings.customContrastColor}
                        onChange={(e) => handleCustomContrast(e.target.value)}
                        placeholder="#38bdf8"
                        className="field font-mono text-xs uppercase"
                        maxLength={7}
                      />
                    </div>
                  </div>
                </div>

                <div className="flex justify-end pt-1">
                  <button
                    onClick={handleResetThemeDefaults}
                    className="flex items-center gap-1.5 text-xs text-muted hover:text-fg rounded-lg px-2.5 py-1.5 hover:bg-surface-2 transition"
                  >
                    <RotateCcw size={13} /> Reset to Default Accent
                  </button>
                </div>
              </Section>

              {/* Frosted Glass Setting */}
              <Section
                title="Material & Frosted Glass"
                icon={<Wand2 size={15} />}
                hint="Controlled background blur on floating panels and headers. Disable for solid, high-contrast surfaces."
              >
                <Toggle
                  label="Frosted Glass & Window Transparency"
                  desc={
                    settings.frostedGlass
                      ? 'Real operating-system desktop transparency on desktop (Windows 11 acrylic, macOS vibrancy, Linux Wayland/X11 compositors). Translucent smoky panels with subtle depth.'
                      : 'Solid opaque surfaces with zero transparency and zero blur for distraction-free, maximum contrast reading.'
                  }
                  checked={settings.frostedGlass}
                  onChange={handleFrostedToggle}
                />
              </Section>
            </div>

        )
      case 'connection':
        return (
            <div className="space-y-5">
              <Section
                title="Provider"
                icon={<Globe2 size={15} />}
                hint={
                  isMobile
                    ? 'Groq, Ollama Cloud (Gemma 4), OpenRouter, Google AI, or custom cloud endpoints.'
                    : 'Groq, Ollama Cloud (Gemma 4), OpenRouter, local models or custom endpoints.'
                }
              >
                {isMobile && isCurrentLocal && (
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-fg flex items-start gap-2.5">
                    <Laptop size={16} className="text-amber-500 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <div className="font-semibold text-amber-500 text-xs">Desktop-Only Local Provider</div>
                      <div className="text-2xs text-muted leading-relaxed">
                        {activePreset?.label || 'Local AI'} is configured on desktop and cannot run on mobile devices. Your desktop configuration remains safely preserved. Please choose a cloud provider (such as Groq, Google AI, or Pollinations) to chat on mobile.
                      </div>
                    </div>
                  </div>
                )}
                <div className="flex flex-wrap gap-1.5">
                  {supportedPresets.map((p) => {
                    const active = settings.baseUrl.trim() === p.baseUrl
                    const isKeyed = settings.keyedProviders.includes(p.id)
                    return (
                      <button
                        key={p.id}
                        onClick={() => {
                          updateSettings({ baseUrl: p.baseUrl })
                          // If Ollama Cloud, suggest gemma4 if no model or default
                          if (p.id === 'ollamacloud' && (!settings.model || settings.model.includes('gpt-oss'))) {
                            updateSettings({ model: 'gemma4' })
                          }
                        }}
                        className={cn(
                          'chip transition',
                          active && 'chip-active',
                          isKeyed && !active && 'opacity-60 text-muted bg-surface-2/40 border-border/60 hover:opacity-85',
                        )}
                        title={isKeyed ? `${p.label} (Key saved)` : p.label}
                      >
                        {p.label}
                        {isKeyed && <span className="ml-1 text-2xs text-accent">✓</span>}
                      </button>
                    )
                  })}
                </div>
                <input
                  type="text"
                  value={settings.baseUrl}
                  onChange={(e) => updateSettings({ baseUrl: e.target.value })}
                  placeholder={DEFAULT_BASE_URL}
                  className="field font-mono text-xs"
                  spellCheck={false}
                />
                <p className="text-2xs text-faint">
                  {presetId === 'ollamacloud' ? (
                    <>
                      Ollama Cloud endpoints host hosted models (e.g. Gemma 4 31B, Llama 3.3). Usage is metered per token (~$0.14 in / $0.40 out per 1M tokens; free tier has starter usage). Get your API key at{' '}
                      <a
                        href="https://ollama.com/settings/keys"
                        target="_blank"
                        rel="noreferrer"
                        className="text-accent underline underline-offset-2"
                      >
                        ollama.com/settings/keys
                      </a>
                      .
                    </>
                  ) : isMobile ? (
                    'Any supported OpenAI-compatible cloud service works. Groq, Ollama Cloud, OpenRouter, Google AI, or Pollinations.'
                  ) : (
                    'Any OpenAI-compatible server works. Groq, Ollama Cloud, OpenRouter, LM Studio, or local Ollama.'
                  )}
                </p>
              </Section>

              <Section
                title={needsKey ? 'Credentials' : 'API key (optional)'}
                icon={<KeyRound size={15} />}
                hint={
                  needsKey
                    ? 'Stored securely on this device and sent only to the provider above.'
                    : isMobile
                      ? 'No API key required for this cloud service.'
                      : 'Local servers usually ignore the key — leave it blank.'
                }
              >
                {activePreset?.id === 'cloudflare' ? (
                  <div className="space-y-3">
                    <div>
                      <label className="text-2xs font-semibold uppercase text-muted block mb-1">
                        Account ID (32-character hexadecimal)
                      </label>
                      <input
                        type="text"
                        value={cfAccountId}
                        onChange={(e) => setCfAccountId(e.target.value)}
                        placeholder="e.g. 1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d"
                        className="field font-mono text-xs"
                        spellCheck={false}
                      />
                    </div>
                    <div>
                      <label className="text-2xs font-semibold uppercase text-muted block mb-1">
                        API Token
                      </label>
                      <div className="relative">
                        <input
                          type={showKey ? 'text' : 'password'}
                          value={cfApiToken}
                          onChange={(e) => setCfApiToken(e.target.value)}
                          placeholder="your cloudflare api token"
                          className="field pr-12 font-mono text-xs sm:pr-9"
                          spellCheck={false}
                        />
                        <button
                          onClick={() => setShowKey((v) => !v)}
                          className="absolute top-1/2 right-1 grid size-9 -translate-y-1/2 place-items-center rounded-lg text-faint hover:text-fg"
                          aria-label={showKey ? 'Hide token' : 'Show token'}
                        >
                          {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center justify-between pt-1">
                      <DoneButton
                        providerId="cloudflare"
                        currentKey={cfApiToken}
                        savedKey={savedCfApiToken}
                        currentExtra={cfAccountId}
                        savedExtra={savedCfAccountId}
                        onSave={async (key, extra) => {
                          await setCloudflareCredentials(extra || '', key)
                          setSavedCfAccountId(extra || '')
                          setSavedCfApiToken(key)
                          const has = Boolean(key.trim() && extra?.trim())
                          const next = has
                            ? Array.from(new Set([...settings.keyedProviders, 'cloudflare']))
                            : settings.keyedProviders.filter((p) => p !== 'cloudflare')
                          updateSettings({ keyedProviders: next })
                        }}
                      />
                      <button
                        onClick={testConnection}
                        className="btn shrink-0"
                        disabled={testState === 'testing'}
                      >
                        {testState === 'testing' ? (
                          <RefreshCw size={15} className="animate-spin text-accent" />
                        ) : (
                          <Zap size={15} />
                        )}
                        Test
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <input
                          type={showKey ? 'text' : 'password'}
                          value={providerKeys[activePreset?.id || 'groq'] ?? settings.apiKey}
                          onChange={(e) => {
                            const val = e.target.value
                            const pid = activePreset?.id || 'groq'
                            setProviderKeys((prev) => ({ ...prev, [pid]: val }))
                            if (pid === 'groq') updateSettings({ apiKey: val })
                          }}
                          placeholder={activePreset?.keyHint ?? 'your key'}
                          className="field pr-12 font-mono text-xs sm:pr-9"
                          spellCheck={false}
                        />
                        <button
                          onClick={() => setShowKey((v) => !v)}
                          className="absolute top-1/2 right-1 grid size-9 -translate-y-1/2 place-items-center rounded-lg text-faint hover:text-fg"
                          aria-label={showKey ? 'Hide API key' : 'Show API key'}
                          title={showKey ? 'Hide key' : 'Show key'}
                        >
                          {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
                        </button>
                      </div>
                      <DoneButton
                        providerId={activePreset?.id || 'groq'}
                        currentKey={providerKeys[activePreset?.id || 'groq'] ?? settings.apiKey}
                        savedKey={savedKeys[activePreset?.id || 'groq'] ?? ''}
                        onSave={async (key) => {
                          const pid = activePreset?.id || 'groq'
                          await setProviderKey(pid, key)
                          setSavedKeys((prev) => ({ ...prev, [pid]: key }))
                          const has = Boolean(key.trim())
                          const next = has
                            ? Array.from(new Set([...settings.keyedProviders, pid]))
                            : settings.keyedProviders.filter((p) => p !== pid)
                          updateSettings({
                            keyedProviders: next,
                            apiKey: pid === 'groq' ? key : settings.apiKey,
                          })
                        }}
                      />
                      <button
                        onClick={testConnection}
                        className="btn shrink-0"
                        disabled={testState === 'testing'}
                      >
                        {testState === 'testing' ? (
                          <RefreshCw size={15} className="animate-spin text-accent" />
                        ) : (
                          <Zap size={15} />
                        )}
                        Test
                      </button>
                    </div>
                  </div>
                )}
                {testState !== 'idle' && (
                  <p
                    className={cn(
                      'flex items-center gap-1.5 text-xs',
                      testState === 'ok'
                        ? 'text-[#30d158]'
                        : testState === 'fail'
                          ? 'text-danger'
                          : 'text-muted',
                    )}
                  >
                    {testState === 'ok' ? <Check size={13} /> : <AlertCircle size={13} />}
                    {testMsg || 'Testing connection…'}
                  </p>
                )}
                <p className="text-2xs text-faint">
                  {activePreset?.keyUrl ? (
                    <>
                      Get an API key at{' '}
                      <a
                        href={activePreset.keyUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-accent underline underline-offset-2"
                      >
                        {activePreset.keyUrl.replace(/^https?:\/\//, '')}
                      </a>
                      .
                    </>
                  ) : needsKey ? (
                    'Paste the API key for the chosen provider.'
                  ) : (
                    'No key needed for this local endpoint.'
                  )}
                </p>
              </Section>

              <Section
                title="Model"
                icon={<Cpu size={15} />}
                hint={curated?.note ?? 'Type or select any model supported by your provider.'}
              >
                <div className="flex gap-2">
                  <input
                    value={settings.model}
                    onChange={(e) => updateSettings({ model: e.target.value })}
                    placeholder="model identifier (e.g. gemma4, openai/gpt-oss-20b)"
                    className="field font-mono text-xs"
                    spellCheck={false}
                  />
                  <button
                    onClick={isMobile && isCurrentLocal ? undefined : testConnection}
                    disabled={testState === 'testing' || (isMobile && isCurrentLocal)}
                    className="btn shrink-0"
                    title={
                      isMobile && isCurrentLocal
                        ? 'Local models run in the Eva Desktop application'
                        : 'Fetch model list from provider'
                    }
                  >
                    <RefreshCw size={15} className={cn(testState === 'testing' && 'animate-spin')} />
                  </button>
                </div>

                <div className="relative">
                  <Search size={13} className="absolute top-1/2 left-3 -translate-y-1/2 text-faint" />
                  <input
                    value={modelFilter}
                    onChange={(e) => setModelFilter(e.target.value)}
                    placeholder={`Filter ${modelOptions.length} available models…`}
                    className="field pl-8 text-xs"
                  />
                </div>

                <div className="scroll-thin max-h-44 overflow-y-auto rounded-xl border border-border">
                  {shownModels.map((m) => (
                    <button
                      key={m}
                      onClick={() => updateSettings({ model: m })}
                      className={cn(
                        'flex w-full items-center gap-2 border-b border-border/60 px-3 py-2.5 text-left font-mono text-xs transition last:border-0 hover:bg-surface-2',
                        settings.model === m && 'bg-surface-2 text-accent font-semibold',
                      )}
                    >
                      <span className="truncate">{m}</span>
                      {settings.model === m && <Check size={13} className="ml-auto shrink-0" />}
                    </button>
                  ))}
                  {shownModels.length === 0 && (
                    <p className="px-3 py-3 text-2xs text-faint">
                      No models listed — click ↻ to query available models from your provider.
                    </p>
                  )}
                </div>

                <p className="text-2xs text-faint">
                  {presetId === 'ollamacloud'
                    ? 'Ollama Cloud supports Google Gemma 4 (gemma4, gemma4:e4b, gemma4:31b). Select a model above or fetch live models.'
                    : !isMobile && presetId === 'ollama'
                      ? 'Local Ollama: run "ollama serve", pull models (e.g. "ollama pull gemma4"), then click ↻.'
                      : 'Providers cap tokens per minute. If you hit a rate limit, wait a few seconds and retry.'}
                </p>
              </Section>

              {/* Capability Switches for Google AI & Pollinations */}
              {(activePreset?.id === 'google' || activePreset?.id === 'pollinations') && (
                <Section
                  title={`${activePreset.label} Modalities`}
                  icon={<Sliders size={15} />}
                  hint="Enable or disable specific capabilities (Chat, Image generation, Voice TTS)."
                >
                  <div className="space-y-3">
                    <div className="rounded-xl border border-border/80 bg-surface/50 p-3 space-y-2">
                      <div className="flex items-center justify-between py-0.5">
                        <span className="text-xs font-semibold text-fg">Chat Generation</span>
                        <CompactSwitch
                          label="Toggle chat generation capability"
                          checked={settings.providerCapabilities[activePreset.id]?.chat !== false}
                          onChange={(val) => {
                            const prev = settings.providerCapabilities[activePreset.id] || { chat: true, image: true, tts: true }
                            updateSettings({
                              providerCapabilities: {
                                ...settings.providerCapabilities,
                                [activePreset.id]: { ...prev, chat: val },
                              },
                            })
                          }}
                        />
                      </div>
                      {settings.providerCapabilities[activePreset.id]?.chat !== false && (
                        <div className="pt-1">
                          <label className="text-2xs text-muted block mb-1">Preferred Model</label>
                          <select
                            value={settings.providerModels[activePreset.id]?.chatModel || ''}
                            onChange={(e) => {
                              const prev = settings.providerModels[activePreset.id] || {}
                              updateSettings({
                                providerModels: {
                                  ...settings.providerModels,
                                  [activePreset.id]: { ...prev, chatModel: e.target.value },
                                },
                              })
                            }}
                            className="field text-xs py-1"
                          >
                            {(MODEL_SUGGESTIONS[activePreset.id] || []).map((m) => (
                              <option key={m} value={m}>
                                {m}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>

                    <div className="rounded-xl border border-border/80 bg-surface/50 p-3 space-y-2">
                      <div className="flex items-center justify-between py-0.5">
                        <span className="text-xs font-semibold text-fg">Image Generation</span>
                        <CompactSwitch
                          label="Toggle image generation capability"
                          checked={settings.providerCapabilities[activePreset.id]?.image !== false}
                          onChange={(val) => {
                            const prev = settings.providerCapabilities[activePreset.id] || { chat: true, image: true, tts: true }
                            updateSettings({
                              providerCapabilities: {
                                ...settings.providerCapabilities,
                                [activePreset.id]: { ...prev, image: val },
                              },
                            })
                          }}
                        />
                      </div>
                      {settings.providerCapabilities[activePreset.id]?.image !== false && (
                        <div className="pt-1">
                          <label className="text-2xs text-muted block mb-1">Preferred Image Model</label>
                          <select
                            value={settings.providerModels[activePreset.id]?.imageModel || ''}
                            onChange={(e) => {
                              const prev = settings.providerModels[activePreset.id] || {}
                              updateSettings({
                                providerModels: {
                                  ...settings.providerModels,
                                  [activePreset.id]: { ...prev, imageModel: e.target.value },
                                },
                              })
                            }}
                            className="field text-xs py-1"
                          >
                            {(activePreset.id === 'google' ? GOOGLE_IMAGE_MODELS : POLLINATIONS_IMAGE_MODELS).map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>

                    <div className="rounded-xl border border-border/80 bg-surface/50 p-3 space-y-2">
                      <div className="flex items-center justify-between py-0.5">
                        <span className="text-xs font-semibold text-fg">Text-to-Speech (TTS)</span>
                        <CompactSwitch
                          label="Toggle text-to-speech capability"
                          checked={settings.providerCapabilities[activePreset.id]?.tts !== false}
                          onChange={(val) => {
                            const prev = settings.providerCapabilities[activePreset.id] || { chat: true, image: true, tts: true }
                            updateSettings({
                              providerCapabilities: {
                                ...settings.providerCapabilities,
                                [activePreset.id]: { ...prev, tts: val },
                              },
                            })
                          }}
                        />
                      </div>
                      {settings.providerCapabilities[activePreset.id]?.tts !== false && (
                        <div className="pt-1">
                          <label className="text-2xs text-muted block mb-1">Preferred Voice</label>
                          <select
                            value={settings.providerModels[activePreset.id]?.ttsVoice || ''}
                            onChange={(e) => {
                              const prev = settings.providerModels[activePreset.id] || {}
                              updateSettings({
                                providerModels: {
                                  ...settings.providerModels,
                                  [activePreset.id]: { ...prev, ttsVoice: e.target.value },
                                },
                              })
                            }}
                            className="field text-xs py-1"
                          >
                            {(activePreset.id === 'google' ? GOOGLE_TTS_VOICES : POLLINATIONS_TTS_VOICES).map((v) => (
                              <option key={v.id} value={v.id}>
                                {v.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                  </div>
                </Section>
              )}

              {/* Defaults & Fallback Sequence */}
              <Section
                title="Capability Defaults & Fallback Sequence"
                icon={<Zap size={15} />}
                hint="Configure preferred defaults for each capability and automatic failover handling."
              >
                <div className="space-y-5">
                  {/* Provider Defaults (Desktop 3-column / Mobile responsive) */}
                  <div>
                    <div className="text-xs font-semibold text-fg mb-2.5">
                      Provider Defaults
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {/* Default Chat Provider */}
                      <div className="flex flex-col gap-1.5 min-w-0">
                        <label htmlFor="default-chat-provider" className="text-2xs font-medium text-muted truncate">
                          Default Chat Provider
                        </label>
                        <select
                          id="default-chat-provider"
                          value={settings.chatDefault?.providerId || 'groq'}
                          onChange={(e) => {
                            const pid = e.target.value
                            const firstModel = MODEL_SUGGESTIONS[pid]?.[0] || ''
                            updateSettings({ chatDefault: { providerId: pid, model: firstModel } })
                          }}
                          className="field text-xs h-9 w-full"
                        >
                          {isMobile && isLocalProvider(settings.chatDefault?.providerId) && (
                            <option value={settings.chatDefault?.providerId} disabled>
                              {PROVIDER_PRESETS.find((p) => p.id === settings.chatDefault?.providerId)?.label || 'Local Provider'} (Desktop Only)
                            </option>
                          )}
                          {supportedPresets.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.label}
                            </option>
                          ))}
                        </select>
                        {isMobile && isLocalProvider(settings.chatDefault?.providerId) && (
                          <p className="text-3xs text-amber-500/90 mt-1 leading-tight">
                            Configured for Eva Desktop. Select a cloud provider for mobile use.
                          </p>
                        )}
                      </div>

                      {/* Default Image Provider */}
                      <div className="flex flex-col gap-1.5 min-w-0">
                        <label htmlFor="default-image-provider" className="text-2xs font-medium text-muted truncate">
                          Default Image Provider
                        </label>
                        <select
                          id="default-image-provider"
                          value={settings.imageDefault?.providerId || 'pollinations'}
                          onChange={(e) => {
                            const pid = e.target.value
                            const currentModel = settings.imageDefault?.model
                            const newModel =
                              pid === 'google'
                                ? (GOOGLE_IMAGE_MODELS.some((m) => m.id === currentModel) ? currentModel : 'imagen-3.0-generate-002')
                                : (POLLINATIONS_IMAGE_MODELS.some((m) => m.id === currentModel) ? currentModel : 'flux')
                            updateSettings({
                              imageDefault: {
                                providerId: pid,
                                model: newModel,
                              },
                            })
                          }}
                          className="field text-xs h-9 w-full"
                        >
                          <option value="pollinations">Pollinations.ai (Flux)</option>
                          <option value="google">
                            Google AI (Imagen 3){!hasGoogleKey ? ' — Requires API key' : ''}
                          </option>
                        </select>
                        {!hasGoogleKey && settings.imageDefault?.providerId === 'google' && (
                          <p className="text-3xs text-amber-500/90 mt-1 leading-tight">
                            API key required in Google provider setup
                          </p>
                        )}
                      </div>

                      {/* Default Voice Provider */}
                      <div className="flex flex-col gap-1.5 min-w-0 sm:col-span-2 lg:col-span-1">
                        <label htmlFor="default-voice-provider" className="text-2xs font-medium text-muted truncate">
                          Default Voice Provider
                        </label>
                        <select
                          id="default-voice-provider"
                          value={settings.ttsDefault?.providerId || 'pollinations'}
                          onChange={(e) => {
                            const pid = e.target.value
                            const currentVoice = settings.ttsDefault?.voice
                            const newVoice =
                              pid === 'google'
                                ? (GOOGLE_TTS_VOICES.some((v) => v.id === currentVoice) ? currentVoice : 'Puck')
                                : (POLLINATIONS_TTS_VOICES.some((v) => v.id === currentVoice) ? currentVoice : 'alloy')
                            updateSettings({
                              ttsDefault: {
                                providerId: pid,
                                voice: newVoice,
                              },
                            })
                          }}
                          className="field text-xs h-9 w-full"
                        >
                          <option value="pollinations">Pollinations.ai (Alloy)</option>
                          <option value="google">
                            Google AI (Puck){!hasGoogleKey ? ' — Requires API key' : ''}
                          </option>
                        </select>
                        {!hasGoogleKey && settings.ttsDefault?.providerId === 'google' && (
                          <p className="text-3xs text-amber-500/90 mt-1 leading-tight">
                            API key required in Google provider setup
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Subtle Divider */}
                  <div className="border-t border-border/60" />

                  {/* Fallback Model Subsection */}
                  <div className="space-y-2.5">
                    <div>
                      <div className="text-xs font-semibold text-fg">Fallback Model</div>
                      <div className="text-2xs text-faint mt-0.5">
                        Secondary endpoint used as a safety net when the primary model fails.
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-center">
                      <div className="sm:col-span-5 min-w-0">
                        <label htmlFor="fallback-provider-select" className="sr-only">
                          Fallback Provider
                        </label>
                        <select
                          id="fallback-provider-select"
                          value={settings.fallbackModel?.providerId || 'groq'}
                          onChange={(e) => {
                            const pid = e.target.value
                            updateSettings({
                              fallbackModel: {
                                providerId: pid,
                                model: MODEL_SUGGESTIONS[pid]?.[0] || '',
                              },
                            })
                          }}
                          className="field text-xs h-9 w-full"
                        >
                          {isMobile && isLocalProvider(settings.fallbackModel?.providerId) && (
                            <option value={settings.fallbackModel?.providerId} disabled>
                              {PROVIDER_PRESETS.find((p) => p.id === settings.fallbackModel?.providerId)?.label || 'Local Provider'} (Desktop Only)
                            </option>
                          )}
                          {supportedPresets.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="sm:col-span-7 min-w-0">
                        <label htmlFor="fallback-model-input" className="sr-only">
                          Fallback Model Identifier
                        </label>
                        <input
                          id="fallback-model-input"
                          type="text"
                          value={settings.fallbackModel?.model || ''}
                          onChange={(e) => {
                            updateSettings({
                              fallbackModel: {
                                providerId: settings.fallbackModel?.providerId || 'groq',
                                model: e.target.value,
                              },
                            })
                          }}
                          placeholder="Model identifier (e.g. llama-3.3-70b-versatile)"
                          className="field text-xs h-9 w-full font-mono"
                        />
                      </div>
                    </div>

                    {isMobile && isLocalProvider(settings.fallbackModel?.providerId) && (
                      <p className="text-3xs text-amber-500/90 mt-1 leading-tight">
                        Fallback to local AI is available in Eva Desktop.
                      </p>
                    )}

                    <p className="text-3xs text-faint leading-relaxed">
                      Queried automatically if primary provider encounters 401/403, 429 rate limit, 5xx outages, or model refusal.
                    </p>
                  </div>
                </div>
              </Section>

              <Section title="Generation Parameters" icon={<Sliders size={15} />}>
                <Slider
                  label="Temperature"
                  value={settings.temperature}
                  min={0}
                  max={2}
                  step={0.05}
                  onChange={(v) => updateSettings({ temperature: v })}
                  display={settings.temperature.toFixed(2)}
                />
                <Slider
                  label="Top P"
                  value={settings.topP}
                  min={0}
                  max={1}
                  step={0.05}
                  onChange={(v) => updateSettings({ topP: v })}
                  display={settings.topP.toFixed(2)}
                />
                <label className="block">
                  <span className="mb-1 block text-xs text-muted">Max tokens</span>
                  <input
                    type="number"
                    min={256}
                    max={8192}
                    step={128}
                    value={settings.maxTokens}
                    onChange={(e) =>
                      updateSettings({
                        maxTokens: clamp(Number(e.target.value) || 2048, 256, 8192),
                      })
                    }
                    className="field tabular-nums"
                  />
                </label>
              </Section>

              <Section title="Behaviour" icon={<MessageSquare size={15} />}>
                <Toggle
                  label="Stream responses"
                  desc="Display text tokens incrementally as they are generated."
                  checked={settings.streaming}
                  onChange={(v) => updateSettings({ streaming: v })}
                />
                <Toggle
                  label="Automatic conversation memory"
                  desc="Continuously summarize conversations to preserve narrative continuity."
                  checked={settings.memoryEnabled}
                  onChange={(v) => updateSettings({ memoryEnabled: v })}
                />
              </Section>

              <Section title="Text-to-Speech (TTS)" icon={<Sparkles size={15} />}>
                <Toggle
                  label="Enable Text-to-Speech"
                  desc="Allow listening to spoken assistant dialogue with high-quality synthetic voices."
                  checked={settings.ttsEnabled}
                  onChange={(v) => updateSettings({ ttsEnabled: v })}
                />
                <Toggle
                  label="Auto-read dialogue"
                  desc="Automatically speak dialogue as soon as a response is received from the assistant."
                  checked={settings.ttsAutoRead}
                  onChange={(v) => updateSettings({ ttsAutoRead: v })}
                />
                <Toggle
                  label="Read scene narration aloud"
                  desc="When enabled, speaks both dialogue and narrative scenes. When disabled, speaks only dialogue in quotation marks."
                  checked={settings.ttsReadNarration}
                  onChange={(v) => updateSettings({ ttsReadNarration: v })}
                />
              </Section>
            </div>

        )
      case 'persona':
        return (
            <div className="space-y-5">
              <Section
                title="Universal system prompt"
                icon={<Terminal size={15} />}
                hint="Master instructions applied across every character in every mode."
              >
                <textarea
                  value={settings.globalSystemPrompt}
                  onChange={(e) => updateSettings({ globalSystemPrompt: e.target.value })}
                  rows={6}
                  className="field scroll-thin resize-none text-xs leading-relaxed"
                />
              </Section>

              <Section
                title="User Persona"
                icon={<User size={15} />}
                hint="Defines your identity, preferences, and standing to every character."
              >
                <textarea
                  value={settings.userPersona}
                  onChange={(e) => updateSettings({ userPersona: e.target.value })}
                  rows={5}
                  className="field scroll-thin resize-none text-xs leading-relaxed"
                  placeholder="Describe yourself…"
                />
                <p className="text-2xs text-faint">
                  In World mode, your specific role and appearance are defined per world.
                </p>
              </Section>
            </div>

        )
      case 'themes':
        return (
            <div className="space-y-3">
              <p className="text-sm text-muted">
                Each mode is an isolated experience. Characters and conversations remain strictly
                within their mode.
              </p>
              {THEME_ORDER.map((id) => {
                const t = THEMES[id]
                const active = settings.theme === id
                return (
                  <div
                    key={id}
                    className={cn(
                      'rounded-2xl border p-4 transition',
                      active ? 'border-accent bg-accent/5' : 'border-border bg-surface',
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className="flex size-10 items-center justify-center rounded-xl bg-accent-grad text-accent-fg font-bold"
                        style={{ fontSize: 18 }}
                      >
                        {t.icon}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h4 className="font-display font-semibold text-fg">{t.name}</h4>
                          <span className="text-2xs text-faint">{t.tagline}</span>
                        </div>
                        <p className="mt-0.5 text-xs text-muted leading-relaxed">{t.blurb}</p>
                      </div>
                      <button
                        onClick={() => setTheme(id)}
                        disabled={active}
                        className={cn('btn shrink-0', active && 'opacity-60')}
                      >
                        {active ? 'Active' : 'Switch'}
                      </button>
                    </div>
                    <ul className="mt-3 flex flex-wrap gap-1.5">
                      {t.features.map((f) => (
                        <li key={f} className="chip text-2xs">
                          {f}
                        </li>
                      ))}
                    </ul>
                  </div>
                )
              })}
            </div>

        )
      case 'commands':
        return (
            <div className="space-y-4">
              <p className="text-sm text-muted leading-relaxed">
                Direct rich scenes by embedding these command tags inside your messages.
              </p>
              <CommandCheatsheet />
            </div>

        )
      case 'data':
        return (
            <div className="space-y-5">
              <Section title="Local Storage Workspace" icon={<Database size={15} />} hint="All data lives private and local on this device.">
                <div className="grid grid-cols-3 gap-2">
                  <Stat label="Characters" value={characters.length} />
                  <Stat label="Worlds" value={worlds.length} />
                  <Stat label="Chats" value={conversations.length} />
                </div>
              </Section>

              <Section title="Setup Guide & Tour" icon={<Sparkles size={15} />} hint="Reopen the interactive provider setup guide and orientation tour.">
                <button
                  onClick={() => setUI({ settingsOpen: false, welcomeOpen: true })}
                  className="btn"
                >
                  <Sparkles size={15} /> Open Setup Guide & Tour
                </button>
              </Section>

              <Section title="Backup & Restore" icon={<Upload size={15} />}>
                <div className="flex flex-wrap gap-2">
                  <button onClick={exportData} className="btn">
                    <Download size={15} /> Export JSON backup
                  </button>
                  <button onClick={() => fileRef.current?.click()} className="btn">
                    <Upload size={15} /> Import backup
                  </button>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="application/json"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      if (f) void importData(f)
                      e.target.value = ''
                    }}
                  />
                </div>
              </Section>

              <Section title="Danger Zone" icon={<Trash2 size={15} />}>
                <button
                  onClick={() => {
                    if (
                      confirm(
                        'Erase ALL characters, worlds, chats and custom settings? This action is irreversible.',
                      )
                    ) {
                      localStorage.removeItem('nexus-chat-store')
                      location.reload()
                    }
                  }}
                  className="btn border-danger/40 text-danger hover:bg-danger/10"
                >
                  <Trash2 size={15} /> Erase everything
                </button>
              </Section>
            </div>

        )
      case 'about':
        return (
            <div className="space-y-6">
              <div className="flex items-center gap-4 rounded-2xl border border-border bg-surface/50 p-4">
                <AppLogo className="size-14 shadow-lg ring-1 ring-border/80" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h2 className="font-display text-lg font-bold text-fg">Eva</h2>
                    <span className="rounded-md bg-accent/15 px-2 py-0.5 text-xs font-semibold text-accent">
                      v2.2.0
                    </span>
                  </div>
                  <p className="text-xs text-muted mt-0.5">
                    Advanced AI Chatbot & Character Creation Studio
                  </p>
                  <p className="text-2xs text-faint mt-1">
                    Free, open-source, privacy-first, client-side application.
                  </p>
                </div>
              </div>

              <Section title="Privacy & Security" icon={<ShieldCheck size={15} />} hint="Zero telemetry, local storage only">
                <div className="rounded-xl border border-border bg-surface p-3.5 text-xs text-muted leading-relaxed space-y-2">
                  <p>
                    <strong className="text-fg">100% Client-Side:</strong> All chats, characters, memories, and settings are stored locally on your device.
                  </p>
                  <p>
                    <strong className="text-fg">Bring Your Own Key:</strong> Your credentials are never sent to any intermediary server. They communicate directly with your chosen OpenAI-compatible endpoint.
                  </p>
                  <p>
                    <strong className="text-fg">No Tracking:</strong> Zero analytics, no cookies, and no tracking libraries are included in this application.
                  </p>
                </div>
              </Section>

              <Section title="Terms & Conditions (T&C)" icon={<Terminal size={15} />} hint="Core user terms">
                <div className="rounded-xl border border-border bg-surface p-3.5 text-2xs text-muted leading-relaxed space-y-2 max-h-48 overflow-y-auto">
                  <p><strong>1. Acceptance:</strong> By using Eva, you agree to these terms.</p>
                  <p><strong>2. License:</strong> Eva is distributed under the MIT License.</p>
                  <p><strong>3. BYOK:</strong> You provide your own API key or local model runner. You are solely responsible for provider billing and compliance with their acceptable use policies.</p>
                  <p><strong>4. AI Content:</strong> Output is generated by LLMs. It is for creative and educational purposes only and not professional, medical, or legal advice.</p>
                  <p><strong>5. Limitation of Liability:</strong> Provided AS IS without warranty of any kind.</p>
                </div>
              </Section>

              <Section title="Open Source Licenses" icon={<ShieldCheck size={15} />} hint="Third-party dependencies and licensing">
                <div className="rounded-xl border border-border bg-surface p-3.5 text-2xs text-muted leading-relaxed space-y-2">
                  <p>
                    <strong className="text-fg">Eva:</strong> MIT License © 2026 AmanicX and Eva contributors.
                  </p>
                  <p className="text-faint">
                    Powered by React 19, Vite, Tailwind CSS, Lucide, Framer Motion, Capacitor, and Electron.
                  </p>
                </div>
              </Section>

              <Section title="Repository & Links" icon={<ExternalLink size={15} />}>
                <div className="flex flex-wrap gap-2">
                  <a
                    href="https://github.com/AmanicX/eva"
                    target="_blank"
                    rel="noreferrer"
                    className="btn btn-secondary text-xs"
                  >
                    <ExternalLink size={13} /> GitHub Repository
                  </a>
                  <a
                    href="https://github.com/AmanicX/eva/releases"
                    target="_blank"
                    rel="noreferrer"
                    className="btn btn-secondary text-xs"
                  >
                    <ExternalLink size={13} /> Releases & Changelog
                  </a>
                </div>
              </Section>
            </div>

        )
      default:
        return null
    }
  }

  if (isDesktopLayout) {
    return (
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.995 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.995 }}
            transition={{ duration: 0.16, ease: 'easeOut' }}
            className="fixed inset-x-0 bottom-0 z-40 flex flex-col bg-bg text-fg select-none overflow-hidden"
            style={{ top: isDesktop ? '36px' : '0px' }}
          >
            {/* Top Bar for Desktop Settings */}
            <header className="hairline h-14 shrink-0 border-b border-border/80 bg-surface/40 backdrop-blur-md px-6 flex items-center justify-between z-10">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setUI({ settingsOpen: false })}
                  className="group inline-flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs font-medium text-muted hover:bg-surface-2 hover:text-fg transition-all active:scale-[0.98]"
                >
                  <ArrowLeft size={16} className="text-muted group-hover:text-fg transition-transform group-hover:-translate-x-0.5" />
                  <span>Back to Studio</span>
                </button>
                <div className="h-4 w-px bg-border/60" />
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-muted/70">Settings</span>
                  <span className="text-muted/40">/</span>
                  <span className="font-semibold text-fg flex items-center gap-1.5">
                    <span className="text-accent">{currentTab.icon}</span>
                    <span>{currentTab.label}</span>
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <kbd className="hidden sm:inline-flex items-center gap-1 text-2xs font-mono text-muted bg-surface-2 border border-border/80 px-2 py-0.5 rounded-md shadow-2xs">
                  Esc
                </kbd>
                <button
                  onClick={() => setUI({ settingsOpen: false })}
                  className="btn btn-ghost size-8 rounded-xl p-0 grid place-items-center text-muted hover:text-fg hover:bg-surface-2 transition active:scale-[0.96]"
                  aria-label="Close settings"
                  title="Close (Esc)"
                >
                  <X size={16} />
                </button>
              </div>
            </header>

            {/* 2-Column Application Layout */}
            <div className="flex min-h-0 flex-1 w-full overflow-hidden">
              {/* Left Navigation Sidebar */}
              <aside className="w-72 border-r border-border/80 bg-surface/30 p-4 flex flex-col justify-between overflow-y-auto scrollbar-none shrink-0">
                <div className="space-y-6">
                  {CATEGORIES.map((cat) => (
                    <div key={cat.id} className="space-y-1.5">
                      <div className="px-3 text-3xs font-bold uppercase tracking-wider text-muted/60">
                        {cat.label}
                      </div>
                      <div className="space-y-0.5">
                        {cat.tabs.map((t) => {
                          const isActive = tab === t.id
                          return (
                            <button
                              key={t.id}
                              onClick={() => setUI({ settingsTab: t.id })}
                              className={cn(
                                'group relative flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-all duration-150',
                                isActive
                                  ? 'bg-surface-3 text-fg font-medium shadow-xs ring-1 ring-border/80'
                                  : 'text-muted hover:bg-surface-2/60 hover:text-fg',
                              )}
                            >
                              {isActive && (
                                <motion.div
                                  layoutId="activeTabIndicator"
                                  className="absolute left-1 top-2.5 bottom-2.5 w-1 rounded-full bg-accent"
                                  transition={{ type: 'spring', stiffness: 450, damping: 35 }}
                                />
                              )}
                              <span
                                className={cn(
                                  'mt-0.5 shrink-0 transition-colors',
                                  isActive ? 'text-accent' : 'text-muted/70 group-hover:text-fg',
                                )}
                              >
                                {t.icon}
                              </span>
                              <div className="min-w-0 flex-1">
                                <div className="text-xs font-semibold leading-snug">{t.label}</div>
                                <div className="text-3xs text-muted/70 leading-normal line-clamp-1 mt-0.5">
                                  {t.desc}
                                </div>
                              </div>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Footer Brand Info */}
                <div className="pt-4 border-t border-border/50">
                  <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-surface/40 border border-border/60">
                    <AppLogo className="size-6 rounded-md shadow-xs ring-1 ring-border/60" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="font-display text-xs font-bold text-fg">Eva</span>
                        <span className="text-3xs font-semibold px-1.5 py-0.2 rounded bg-accent/15 text-accent">
                          v2.2.0
                        </span>
                      </div>
                      <p className="text-3xs text-muted truncate">Client-Side AI Studio</p>
                    </div>
                  </div>
                </div>
              </aside>

              {/* Right Main Content Area */}
              <main className="flex-1 overflow-y-auto p-8 lg:p-10 scroll-thin bg-bg/50">
                <div className="max-w-4xl mx-auto space-y-6">
                  {/* Current Section Header */}
                  <div className="border-b border-border/80 pb-5">
                    <div className="flex items-center gap-3">
                      <div className="size-10 rounded-xl bg-accent/10 border border-accent/20 grid place-items-center text-accent">
                        {currentTab.icon}
                      </div>
                      <div>
                        <h1 className="font-display text-2xl font-bold tracking-tight text-fg">
                          {currentTab.label}
                        </h1>
                        <p className="text-xs text-muted mt-0.5 leading-relaxed">
                          {currentTab.headerDesc}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Animated Tab Body */}
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={tab}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.16, ease: 'easeOut' }}
                    >
                      {renderTabContent(tab)}
                    </motion.div>
                  </AnimatePresence>
                </div>
              </main>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    )
  }

  return (
    <Modal
      open={open}
      onClose={() => setUI({ settingsOpen: false })}
      title="Settings"
      subtitle="Configure studio, appearance & AI models"
      icon={<Zap size={18} />}
      size="lg"
      bodyClassName="p-0"
    >
      <div className="flex flex-col min-h-[60dvh]">
        {/* Mobile Horizontal Scrolling Tabs */}
        <nav
          aria-label="Settings categories"
          className="scrollbar-none flex gap-1.5 overflow-x-auto border-b border-border/80 bg-surface/30 px-3 py-2 shrink-0 touch-pan-x"
        >
          {TABS.map((t) => {
            const isActive = tab === t.id
            return (
              <button
                key={t.id}
                onClick={() => setUI({ settingsTab: t.id })}
                className={cn(
                  'flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-medium whitespace-nowrap min-h-[44px] transition-all active:scale-[0.98]',
                  isActive
                    ? 'bg-surface-3 text-fg shadow-xs border border-border/80 text-accent font-semibold'
                    : 'text-muted hover:bg-surface-2 hover:text-fg',
                )}
              >
                <span className={isActive ? 'text-accent' : 'text-muted'}>{t.icon}</span>
                <span>{t.label}</span>
              </button>
            )
          })}
        </nav>

        {/* Mobile Content Body */}
        <div className="scroll-thin max-h-[65dvh] flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          <AnimatePresence mode="wait">
            <motion.div
              key={tab}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.14, ease: 'easeOut' }}
            >
              {renderTabContent(tab)}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </Modal>
  )
}


function Section({
  title,
  hint,
  icon,
  children,
  className,
}: {
  title: string
  hint?: string
  icon?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <section
      className={cn(
        'rounded-2xl border border-border/80 bg-surface/40 p-5 sm:p-6 space-y-4 shadow-xs hover:border-border transition-colors',
        className,
      )}
    >
      <div>
        <h3 className="flex items-center gap-2 text-sm sm:text-base font-semibold text-fg tracking-tight">
          {icon && <span className="text-accent shrink-0">{icon}</span>}
          <span>{title}</span>
        </h3>
        {hint && <p className="mt-1 text-2xs sm:text-xs text-muted leading-relaxed">{hint}</p>}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  )
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  display,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  display: string
  onChange: (v: number) => void
}) {
  return (
    <label className="block">
      <span className="mb-1 flex items-center justify-between text-xs text-muted">
        {label}
        <span className="font-mono text-fg tabular-nums">{display}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full"
      />
    </label>
  )
}

function CompactSwitch({
  checked,
  onChange,
  label,
  id,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  id?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      id={id}
      onClick={() => onChange(!checked)}
      className="inline-flex shrink-0 items-center justify-center p-0.5 rounded-full transition focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      <span className="switch" data-on={checked}>
        <span />
      </span>
    </button>
  )
}

function Toggle({
  label,
  desc,
  checked,
  onChange,
  compact = false,
}: {
  label: string
  desc?: string
  checked: boolean
  onChange: (v: boolean) => void
  compact?: boolean
}) {
  if (compact || !label) {
    return (
      <CompactSwitch
        label={label || desc || 'Toggle setting'}
        checked={checked}
        onChange={onChange}
      />
    )
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center gap-3 rounded-xl border border-border bg-surface px-3.5 py-3 text-left transition hover:border-border-strong"
    >
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-fg">{label}</div>
        {desc && <div className="text-2xs text-faint mt-0.5 leading-relaxed">{desc}</div>}
      </div>
      <span className="switch" data-on={checked}>
        <span />
      </span>
    </button>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-surface px-3 py-2.5 text-center">
      <div className="font-display text-xl font-bold tabular-nums text-fg">{value}</div>
      <div className="text-2xs text-faint mt-0.5">{label}</div>
    </div>
  )
}
