import { useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Cpu,
  ExternalLink,
  Eye,
  EyeOff,
  Globe2,
  HelpCircle,
  KeyRound,
  Palette,
  RefreshCw,
  RotateCcw,
  Server,
  ShieldCheck,
  Sparkles,
  Terminal,
  Users,
  Volume2,
  Zap,
} from 'lucide-react'
import { useStore } from '@/store/useStore'
import {
  PROVIDER_PRESETS,
  listGroqModels,
  providerNeedsKey,
  suggestionsFor,
} from '@/lib/groq'
import {
  PROVIDER_GUIDES,
  getGuideForBaseUrl,
  type ProviderGuide,
} from '@/lib/providerGuides'
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
} from '@/lib/platform'
import { DoneButton } from './DoneButton'
import { Modal } from './Modal'
import { cn } from '@/lib/utils'
import { AppLogo } from '@/components/AppLogo'

const STEPS = [
  { label: 'Welcome', title: 'Welcome to Eva', subtitle: 'A private AI studio for characters, worlds, and intelligence.' },
  { label: 'Provider', title: 'Choose AI Provider', subtitle: 'Pick a cloud provider or connect your own local server.' },
  { label: 'Setup Guide', title: 'Connect & Verify', subtitle: 'Follow the step-by-step instructions for your selected provider.' },
  { label: 'Model', title: 'Pick a Model', subtitle: 'Choose a recommended model or select from your provider’s catalog.' },
  { label: 'Voice', title: 'Speech & Audio', subtitle: 'Configure expressive spoken dialogue and text-to-speech.' },
  { label: 'Visuals', title: 'Scene Visuals', subtitle: 'Enable striking image generation for your story scenes.' },
  { label: 'Tour', title: 'How Eva Works', subtitle: 'A quick tour of universes, characters, and memory.' },
] as const

const ORIENTATION_TIPS = [
  {
    icon: <Palette size={16} />,
    title: 'Three Separate Universes',
    body: 'Chatbot, Anime, and World universes are completely isolated. Your characters, chats, and lore never bleed into each other.',
  },
  {
    icon: <Users size={16} />,
    title: 'Character Creation & Roster',
    body: 'Write original personas from scratch or explore ready-made characters. Eva preserves deep backstories and voice mannerisms.',
  },
  {
    icon: <Globe2 size={16} />,
    title: 'Living World Lore',
    body: 'In the World theme, places, factions, reputation, and events persist across scenes, shaping how NPCs respond to you.',
  },
  {
    icon: <Terminal size={16} />,
    title: 'Direct the Scene',
    body: 'Use in-chat commands to guide the narrative: specify hidden thoughts, stage events, or roll dice. Press the Terminal button anytime.',
  },
  {
    icon: <Sparkles size={16} />,
    title: 'Long-Term Memory',
    body: 'Conversations are automatically summarized and integrated so characters remember important events without losing context.',
  },
  {
    icon: <ShieldCheck size={16} />,
    title: 'Privacy & Local Storage',
    body: 'Zero telemetry. Your data stays securely on your device with local storage.',
  },
] as const

export function Welcome() {
  const settings = useStore((s) => s.settings)
  const ui = useStore((s) => s.ui)
  const setUI = useStore((s) => s.setUI)
  const updateSettings = useStore((s) => s.updateSettings)

  const open = ui.welcomeOpen || !settings.onboarded

  const [step, setStep] = useState(0)
  const [showKey, setShowKey] = useState(false)
  const [testing, setTesting] = useState(false)
  const [result, setResult] = useState<'idle' | 'ok' | 'fail'>('idle')
  const [message, setMessage] = useState('')
  const [copiedSnippet, setCopiedSnippet] = useState<string | null>(null)
  const [showErrors, setShowErrors] = useState(false)
  const [completedSteps, setCompletedSteps] = useState<Record<string, Record<number, boolean>>>({})

  const [cfAccountId, setCfAccountId] = useState('')
  const [cfApiToken, setCfApiToken] = useState('')
  const [savedCfAccountId, setSavedCfAccountId] = useState('')
  const [savedCfApiToken, setSavedCfApiToken] = useState('')
  const [savedKey, setSavedKey] = useState('')

  const isMobile = isMobilePlatform()
  const supportedPresets = useMemo(
    () => getSupportedProviderPresets(PROVIDER_PRESETS, isMobile),
    [isMobile],
  )

  // Determine active guide based on current baseUrl
  const currentGuide: ProviderGuide = useMemo(() => {
    const guide = getGuideForBaseUrl(settings.baseUrl)
    if (isMobile && isLocalProvider(guide.id)) {
      return PROVIDER_GUIDES.groq
    }
    return guide
  }, [settings.baseUrl, isMobile])

  useEffect(() => {
    if (!open) return
    const provId = currentGuide.id
    if (provId === 'cloudflare') {
      void getCloudflareCredentials().then((creds) => {
        setCfAccountId(creds.accountId)
        setSavedCfAccountId(creds.accountId)
        setCfApiToken(creds.apiToken)
        setSavedCfApiToken(creds.apiToken)
      })
    } else {
      void getProviderKey(provId).then((k) => {
        const val = k || (provId === 'groq' ? settings.apiKey : '')
        setSavedKey(val)
      })
    }
  }, [open, currentGuide.id, settings.apiKey])

  const needsKey = providerNeedsKey(settings.baseUrl)
  const currentStepInfo = STEPS[step]

  // Models available for selection
  const availableModels = useMemo(() => {
    const list = new Set<string>()
    // 1. Recommended models from guide
    for (const m of currentGuide.recommendedModels) {
      list.add(m.id)
    }
    // 2. Suggestions from groq.ts
    for (const s of suggestionsFor(settings.baseUrl)) {
      list.add(s)
    }
    // 3. Cached live models fetched from provider
    for (const c of settings.cachedModels) {
      list.add(c)
    }
    return Array.from(list).filter(Boolean)
  }, [currentGuide, settings.baseUrl, settings.cachedModels])

  const toggleStepCompleted = (providerId: string, stepNumber: number) => {
    setCompletedSteps((prev) => {
      const providerSteps = prev[providerId] || {}
      return {
        ...prev,
        [providerId]: {
          ...providerSteps,
          [stepNumber]: !providerSteps[stepNumber],
        },
      }
    })
  }

  const copyText = (text: string) => {
    void navigator.clipboard.writeText(text)
    setCopiedSnippet(text)
    setTimeout(() => setCopiedSnippet(null), 2500)
  }

  const close = () => {
    updateSettings({ onboarded: true })
    setUI({ welcomeOpen: false })
    setStep(0)
    setResult('idle')
    setMessage('')
  }

  const selectProviderPreset = (presetId: string) => {
    if (isMobile && isLocalProvider(presetId)) return
    const guide = PROVIDER_GUIDES[presetId] || PROVIDER_GUIDES.groq
    updateSettings({
      baseUrl: guide.defaultBaseUrl,
      // If default model exists for this provider, set it
      model: guide.recommendedModels[0]?.id || settings.model,
    })
    setResult('idle')
    setMessage('')
  }

  const testConnection = async () => {
    if (needsKey && !settings.apiKey.trim()) {
      setResult('fail')
      setMessage('Please enter your API key first.')
      return
    }

    setTesting(true)
    setResult('idle')
    setMessage('')

    try {
      const list = await listGroqModels(settings.apiKey, settings.baseUrl)
      updateSettings({ cachedModels: list })
      setResult('ok')
      setMessage(`Connection verified! Found ${list.length} available models.`)
      // If user hasn't selected a valid model yet or default changed, pick first available
      if (list.length > 0 && (!settings.model || !list.includes(settings.model))) {
        if (currentGuide.recommendedModels.length > 0) {
          const match = currentGuide.recommendedModels.find((rm) => list.includes(rm.id))
          if (match) updateSettings({ model: match.id })
        }
      }
    } catch (e: any) {
      setResult('fail')
      const errMsg = e instanceof Error ? e.message : 'Connection failed.'
      setMessage(errMsg)
    } finally {
      setTesting(false)
    }
  }

  // Count how many guide steps user checked off for current provider
  const completedCount = useMemo(() => {
    const provSteps = completedSteps[currentGuide.id] || {}
    return Object.values(provSteps).filter(Boolean).length
  }, [completedSteps, currentGuide.id])

  return (
    <Modal
      open={open}
      onClose={close}
      title={currentStepInfo.title}
      subtitle={currentStepInfo.subtitle}
      icon={<Zap size={18} />}
      size="lg"
      bodyClassName="p-0"
      footer={
        <div className="flex w-full items-center gap-2">
          <button onClick={close} className="btn btn-ghost mr-auto text-xs sm:text-sm">
            Skip setup
          </button>
          {step > 0 && (
            <button onClick={() => setStep((s) => s - 1)} className="btn text-xs sm:text-sm">
              Back
            </button>
          )}
          {step < STEPS.length - 1 ? (
            <button onClick={() => setStep((s) => s + 1)} className="btn btn-accent text-xs sm:text-sm">
              Continue
            </button>
          ) : (
            <button onClick={close} className="btn btn-accent text-xs sm:text-sm">
              <Check size={16} />
              Start using Eva
            </button>
          )}
        </div>
      }
    >
      {/* Step Progress Header */}
      <div className="flex items-center gap-1.5 border-b border-border px-5 py-2.5 sm:px-6 bg-surface/50">
        {STEPS.map((s, i) => (
          <button
            key={s.label}
            onClick={() => setStep(i)}
            className={cn(
              'flex flex-1 flex-col gap-1.5 text-left transition',
              i <= step ? 'text-fg' : 'text-faint hover:text-muted',
            )}
          >
            <span
              className={cn(
                'h-1 rounded-full transition-all duration-300',
                i === step ? 'bg-accent' : i < step ? 'bg-accent/60' : 'bg-border',
              )}
            />
            <span className="text-2xs font-semibold tracking-wide uppercase truncate hidden sm:inline">
              {s.label}
            </span>
          </button>
        ))}
      </div>

      <div className="scroll-thin max-h-[62dvh] overflow-y-auto p-5 sm:p-6 space-y-5">
        {/* ================================================================= */}
        {/* STEP 0: WELCOME OVERVIEW                                         */}
        {/* ================================================================= */}
        {step === 0 && (
          <div className="space-y-4">
            <div className="flex items-center gap-4 p-4 rounded-2xl border border-border/80 bg-surface-2/60 material">
              <AppLogo
                alt="Eva"
                className="size-12 rounded-xl object-cover shadow-md ring-1 ring-border shrink-0"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-display text-base font-bold text-fg">Eva AI Studio</h3>
                  <span className="rounded-full bg-accent/15 px-2 py-0.5 text-2xs font-medium text-accent">
                    v2.2.0
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-muted">
                  A privacy-first, memory-aware character and story studio.
                </p>
              </div>
            </div>

            <p className="text-sm leading-relaxed text-muted">
              {isMobile
                ? 'Eva is designed to give you complete creative freedom. Rather than locking you into a proprietary subscription, Eva connects directly to whichever cloud AI provider you choose: fast cloud inference via Groq, OpenRouter, Google AI, or Pollinations. Private offline local models (Ollama, LM Studio) are supported when running Eva Desktop.'
                : 'Eva is designed to give you complete creative freedom. Rather than locking you into a proprietary subscription, Eva connects directly to whichever AI provider you choose: fast cloud inference (Groq, OpenRouter, OpenAI) or 100% private models running locally on your own computer (Ollama, LM Studio).'}
            </p>

            <div className="grid gap-2.5 sm:grid-cols-3">
              <div className="rounded-xl border border-border bg-surface p-3.5 space-y-1">
                <div className="flex items-center gap-2 text-accent">
                  <Cpu size={15} />
                  <h4 className="text-xs font-semibold text-fg">You Bring The Model</h4>
                </div>
                <p className="text-2xs text-muted leading-relaxed">
                  {isMobile
                    ? 'Connect Groq (free tier), OpenRouter, Google AI, or Pollinations.'
                    : 'Connect Groq (free tier), OpenRouter, or run models offline via Ollama.'}
                </p>
              </div>

              <div className="rounded-xl border border-border bg-surface p-3.5 space-y-1">
                <div className="flex items-center gap-2 text-accent">
                  <ShieldCheck size={15} />
                  <h4 className="text-xs font-semibold text-fg">Private & Local First</h4>
                </div>
                <p className="text-2xs text-muted leading-relaxed">
                  Characters, worlds, and chat transcripts stay on your device with hardware encryption.
                </p>
              </div>

              <div className="rounded-xl border border-border bg-surface p-3.5 space-y-1">
                <div className="flex items-center gap-2 text-accent">
                  <Sparkles size={15} />
                  <h4 className="text-xs font-semibold text-fg">Long-Term Memory</h4>
                </div>
                <p className="text-2xs text-muted leading-relaxed">
                  Automatic summarization preserves story context without losing narrative shape.
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-accent/20 bg-accent/5 p-3.5 flex items-center justify-between gap-3">
              <div className="text-xs text-muted">
                <span className="font-semibold text-fg">First time setup takes 1–2 minutes.</span> Next, pick your AI provider.
              </div>
              <button
                onClick={() => setStep(1)}
                className="btn btn-accent text-xs shrink-0 py-1.5 px-3"
              >
                Choose Provider &rarr;
              </button>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* STEP 1: CHOOSE AI PROVIDER                                       */}
        {/* ================================================================= */}
        {step === 1 && (
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-fg">Select your preferred AI provider</h3>
              <p className="mt-0.5 text-xs text-muted">
                Select where you want your model to run. You can change this anytime from Settings.
              </p>
            </div>

            <div className="grid gap-2.5 sm:grid-cols-2">
              {supportedPresets.map((p) => {
                const guide = PROVIDER_GUIDES[p.id] || PROVIDER_GUIDES.custom
                const isSelected = currentGuide.id === p.id
                const isKeyed = settings.keyedProviders.includes(p.id)

                return (
                  <button
                    key={p.id}
                    onClick={() => selectProviderPreset(p.id)}
                    className={cn(
                      'group relative flex flex-col justify-between rounded-xl border p-3.5 text-left transition',
                      isSelected
                        ? 'border-accent bg-accent/10 shadow-sm ring-1 ring-accent'
                        : isKeyed
                          ? 'border-border/60 bg-surface-2/40 opacity-60 hover:opacity-85'
                          : 'border-border bg-surface hover:border-accent/40 hover:bg-surface-2',
                    )}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-sm text-fg group-hover:text-accent transition">
                          {p.label}
                        </span>
                        <div className="flex items-center gap-1.5">
                          {isKeyed && (
                            <span className="rounded-full bg-accent/15 px-2 py-0.5 text-2xs font-semibold text-accent">
                              Key Saved
                            </span>
                          )}
                          {guide.badge && (
                            <span
                              className={cn(
                                'rounded-full px-2 py-0.5 text-2xs font-medium',
                                guide.badgeVariant === 'accent'
                                  ? 'bg-accent/20 text-accent font-semibold'
                                  : guide.badgeVariant === 'success'
                                    ? 'bg-[#30d158]/15 text-[#30d158] font-semibold'
                                    : 'bg-surface-3 text-muted',
                              )}
                            >
                              {guide.badge}
                            </span>
                          )}
                        </div>
                      </div>
                      <p className="mt-1 text-2xs text-muted leading-relaxed">
                        {guide.tagline}
                      </p>
                    </div>

                    <div className="mt-3 flex items-center justify-between text-2xs text-faint">
                      <span>{guide.isLocal ? 'Offline server' : 'Cloud API'}</span>
                      {isSelected ? (
                        <span className="flex items-center gap-1 font-semibold text-accent">
                          <Check size={13} /> Selected
                        </span>
                      ) : (
                        <span className="text-muted group-hover:text-fg">Click to select</span>
                      )}
                    </div>
                  </button>
                )
              })}

              {/* Custom Provider Card */}
              <button
                onClick={() => selectProviderPreset('custom')}
                className={cn(
                  'group relative flex flex-col justify-between rounded-xl border p-3.5 text-left transition',
                  currentGuide.id === 'custom'
                    ? 'border-accent bg-accent/10 shadow-sm ring-1 ring-accent'
                    : 'border-border bg-surface hover:border-accent/40 hover:bg-surface-2',
                )}
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-sm text-fg group-hover:text-accent transition">
                      Custom OpenAI Endpoint
                    </span>
                    <span className="rounded-full bg-surface-3 px-2 py-0.5 text-2xs text-muted">
                      Custom
                    </span>
                  </div>
                  <p className="mt-1 text-2xs text-muted leading-relaxed">
                    Connect any self-hosted or compatible API (DeepSeek, Mistral, vLLM, text-generation-webui).
                  </p>
                </div>
                <div className="mt-3 flex items-center justify-between text-2xs text-faint">
                  <span>Custom URL</span>
                  {currentGuide.id === 'custom' ? (
                    <span className="flex items-center gap-1 font-semibold text-accent">
                      <Check size={13} /> Selected
                    </span>
                  ) : (
                    <span className="text-muted group-hover:text-fg">Click to select</span>
                  )}
                </div>
              </button>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setStep(2)}
                className="btn btn-accent text-xs sm:text-sm"
              >
                Continue to {currentGuide.name} Setup &rarr;
              </button>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* STEP 2: DYNAMIC PROVIDER-SPECIFIC SETUP GUIDE                    */}
        {/* ================================================================= */}
        {step === 2 && (
          <div className="space-y-5">
            {/* Active Provider Header Banner */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-accent/40 bg-accent/5 p-4">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-fg">{currentGuide.name} Setup Guide</h3>
                  {currentGuide.badge && (
                    <span className="rounded-full bg-accent/15 px-2 py-0.5 text-2xs font-semibold text-accent">
                      {currentGuide.badge}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-2xs text-muted">{currentGuide.tagline}</p>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-2xs text-muted">
                  Progress: {completedCount} / {currentGuide.steps.length} steps
                </span>
                <div className="h-2 w-16 rounded-full bg-border overflow-hidden">
                  <div
                    className="h-full bg-accent transition-all duration-300"
                    style={{
                      width: `${(completedCount / currentGuide.steps.length) * 100}%`,
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Provider Requirements */}
            {currentGuide.requirements.length > 0 && (
              <div className="rounded-xl border border-border/80 bg-surface p-3.5">
                <h4 className="text-2xs font-semibold uppercase tracking-wider text-faint">
                  What you will need
                </h4>
                <ul className="mt-1.5 space-y-1">
                  {currentGuide.requirements.map((req) => (
                    <li key={req} className="flex items-center gap-2 text-xs text-muted">
                      <span className="size-1.5 rounded-full bg-accent shrink-0" />
                      {req}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Step-by-Step Instructions */}
            <div className="space-y-3">
              <h4 className="text-xs font-semibold text-fg">Step-by-Step Instructions</h4>

              {currentGuide.steps.map((st) => {
                const isStepChecked = !!(completedSteps[currentGuide.id]?.[st.number])

                return (
                  <div
                    key={st.number}
                    className={cn(
                      'rounded-xl border p-3.5 transition',
                      isStepChecked
                        ? 'border-border/60 bg-surface/40'
                        : 'border-border bg-surface',
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <button
                          onClick={() => toggleStepCompleted(currentGuide.id, st.number)}
                          className={cn(
                            'mt-0.5 size-5 shrink-0 rounded-md border flex items-center justify-center transition',
                            isStepChecked
                              ? 'border-accent bg-accent text-accent-fg'
                              : 'border-border hover:border-accent text-transparent',
                          )}
                          title="Mark step completed"
                        >
                          <Check size={13} className={cn(!isStepChecked && 'opacity-0')} />
                        </button>

                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-xs text-fg">
                              Step {st.number}: {st.title}
                            </span>
                          </div>
                          <p className="text-xs leading-relaxed text-muted">{st.instruction}</p>

                          {st.tip && (
                            <p className="text-2xs text-faint italic bg-surface-2/60 p-2 rounded-lg border border-border/50">
                              Tip: {st.tip}
                            </p>
                          )}

                          {/* Copy snippet for terminal commands (e.g. Ollama) */}
                          {st.copySnippet && (
                            <div className="mt-2 flex items-center gap-2 rounded-lg bg-surface-2 p-2 border border-border">
                              <code className="font-mono text-2xs text-fg truncate flex-1">
                                {st.copySnippet}
                              </code>
                              <button
                                onClick={() => copyText(st.copySnippet!)}
                                className="btn btn-ghost py-1 px-2 text-2xs shrink-0 flex items-center gap-1"
                              >
                                {copiedSnippet === st.copySnippet ? (
                                  <>
                                    <Check size={12} className="text-[#30d158]" /> Copied
                                  </>
                                ) : (
                                  <>
                                    <Copy size={12} /> Copy
                                  </>
                                )}
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* External Action Link */}
                      {st.actionUrl && (
                        <div className="flex flex-col gap-1 shrink-0">
                          <a
                            href={st.actionUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="btn btn-accent py-1.5 px-3 text-2xs inline-flex items-center gap-1.5"
                          >
                            <span>{st.actionLabel || 'Open Link'}</span>
                            <ExternalLink size={12} />
                          </a>
                          <button
                            onClick={() => copyText(st.actionUrl!)}
                            className="btn btn-ghost py-1 px-2 text-2xs flex items-center gap-1 text-faint hover:text-fg"
                            title="Copy URL"
                          >
                            {copiedSnippet === st.actionUrl ? (
                              <span className="text-[#30d158]">Copied link</span>
                            ) : (
                              <>
                                <Copy size={11} /> Copy link
                              </>
                            )}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Credential & Connection Configuration Card */}
            <div className="rounded-2xl border border-border bg-surface-2 p-4 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-fg">
                  <KeyRound size={16} className="text-accent" />
                  <h4 className="text-xs font-bold uppercase tracking-wider">
                    {needsKey ? `${currentGuide.name} API Key` : 'Local Server Settings'}
                  </h4>
                </div>
                {needsKey && (
                  <span className="text-2xs text-faint">
                    Keys are hardware-encrypted & never transmitted elsewhere.
                  </span>
                )}
              </div>

              {currentGuide.id === 'cloudflare' ? (
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
                  <div className="pt-1">
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
                  </div>
                </div>
              ) : needsKey ? (
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <input
                        type={showKey ? 'text' : 'password'}
                        value={settings.apiKey}
                        onChange={(e) => updateSettings({ apiKey: e.target.value })}
                        placeholder={currentGuide.keyPlaceholder}
                        className="field pr-12 font-mono text-xs sm:pr-9"
                        spellCheck={false}
                      />
                      <button
                        onClick={() => setShowKey((v) => !v)}
                        className="absolute top-1/2 right-1 grid size-9 -translate-y-1/2 place-items-center rounded-lg text-faint hover:text-fg"
                        aria-label={showKey ? 'Hide API key' : 'Show API key'}
                      >
                        {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>
                    <DoneButton
                      providerId={currentGuide.id}
                      currentKey={settings.apiKey}
                      savedKey={savedKey}
                      onSave={async (key) => {
                        await setProviderKey(currentGuide.id, key)
                        setSavedKey(key)
                        const has = Boolean(key.trim())
                        const next = has
                          ? Array.from(new Set([...settings.keyedProviders, currentGuide.id]))
                          : settings.keyedProviders.filter((p) => p !== currentGuide.id)
                        updateSettings({ keyedProviders: next })
                      }}
                    />
                  </div>

                  {currentGuide.keyManagementUrl && (
                    <p className="text-2xs text-faint">
                      Get or manage your API keys at{' '}
                      <a
                        href={currentGuide.keyManagementUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-accent underline underline-offset-2"
                      >
                        {currentGuide.keyManagementUrl.replace('https://', '')}
                      </a>
                    </p>
                  )}
                </div>
              ) : (
                <div className="rounded-xl border border-border bg-surface p-3 text-xs text-muted flex items-center gap-2">
                  <Server size={16} className="text-[#30d158] shrink-0" />
                  <span>
                    No API key is required. Eva communicates directly with your local server endpoint on your machine.
                  </span>
                </div>
              )}

              {/* Base URL configuration */}
              <div className="space-y-1.5 pt-2 border-t border-border">
                <div className="flex items-center justify-between text-2xs text-faint">
                  <label htmlFor="base-url-input" className="font-semibold">Endpoint Base URL</label>
                  {settings.baseUrl !== currentGuide.defaultBaseUrl && (
                    <button
                      onClick={() => updateSettings({ baseUrl: currentGuide.defaultBaseUrl })}
                      className="text-accent hover:underline flex items-center gap-1"
                    >
                      <RotateCcw size={10} /> Reset to default
                    </button>
                  )}
                </div>
                <input
                  id="base-url-input"
                  type="text"
                  value={settings.baseUrl}
                  onChange={(e) => updateSettings({ baseUrl: e.target.value })}
                  placeholder={currentGuide.defaultBaseUrl}
                  className="field font-mono text-xs"
                  spellCheck={false}
                />
              </div>

              {/* Test Connection Button & Result Banner */}
              <div className="pt-2 flex flex-col gap-2">
                <button
                  onClick={testConnection}
                  disabled={testing}
                  className="btn btn-accent w-full flex items-center justify-center gap-2 py-2.5 text-xs font-semibold"
                >
                  <RefreshCw size={15} className={cn(testing && 'animate-spin')} />
                  {testing ? 'Testing connection with provider...' : 'Test Connection'}
                </button>

                {result !== 'idle' && (
                  <div
                    className={cn(
                      'rounded-xl border p-3 flex items-start gap-2.5 text-xs transition',
                      result === 'ok'
                        ? 'border-[#30d158]/40 bg-[#30d158]/10 text-fg'
                        : 'border-danger/40 bg-danger/10 text-fg',
                    )}
                  >
                    {result === 'ok' ? (
                      <Check size={16} className="text-[#30d158] shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle size={16} className="text-danger shrink-0 mt-0.5" />
                    )}
                    <div className="space-y-1 flex-1">
                      <p className="font-semibold">{result === 'ok' ? 'Connected successfully!' : 'Connection test failed'}</p>
                      <p className="text-2xs text-muted leading-relaxed">{message}</p>
                      {result === 'ok' && (
                        <p className="text-2xs text-accent font-semibold pt-1">
                          You are ready! Click "Continue to Pick a Model" below.
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Troubleshooting & Common Errors Accordion */}
            {currentGuide.commonErrors.length > 0 && (
              <div className="rounded-xl border border-border bg-surface overflow-hidden">
                <button
                  onClick={() => setShowErrors((v) => !v)}
                  className="w-full flex items-center justify-between p-3.5 text-left text-xs font-semibold text-fg hover:bg-surface-2 transition"
                >
                  <span className="flex items-center gap-2">
                    <HelpCircle size={15} className="text-accent" />
                    Common Issues & Troubleshooting ({currentGuide.name})
                  </span>
                  {showErrors ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                </button>

                {showErrors && (
                  <div className="border-t border-border p-3.5 space-y-3 bg-surface-2/40">
                    {currentGuide.commonErrors.map((err) => (
                      <div key={err.code} className="space-y-1 text-xs">
                        <div className="flex items-center gap-2">
                          <span className="rounded bg-surface-3 px-1.5 py-0.5 font-mono text-2xs text-faint">
                            {err.code}
                          </span>
                          <span className="font-semibold text-fg">{err.title}</span>
                        </div>
                        <p className="text-2xs text-muted pl-7">
                          <span className="text-faint">Cause:</span> {err.cause}
                        </p>
                        <p className="text-2xs text-fg pl-7 font-medium">
                          <span className="text-accent">Fix:</span> {err.resolution}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-between items-center pt-2">
              <button
                onClick={() => setStep(1)}
                className="btn text-xs sm:text-sm"
              >
                &larr; Change Provider
              </button>
              <button
                onClick={() => setStep(3)}
                className="btn btn-accent text-xs sm:text-sm"
              >
                Continue to Pick Model &rarr;
              </button>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* STEP 3: PICK A MODEL                                             */}
        {/* ================================================================= */}
        {step === 3 && (
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-fg">
                  Choose a model for {currentGuide.name}
                </h3>
                <button
                  onClick={testConnection}
                  disabled={testing}
                  className="btn btn-ghost text-2xs flex items-center gap-1"
                  title="Refresh models from provider"
                >
                  <RefreshCw size={12} className={cn(testing && 'animate-spin')} />
                  Fetch live models
                </button>
              </div>
              <p className="mt-0.5 text-xs text-muted">
                Select from recommended starting models or pick any model ID supported by your endpoint.
              </p>
            </div>

            {/* Model list */}
            <div className="scroll-thin max-h-64 overflow-y-auto rounded-xl border border-border divide-y divide-border/60 bg-surface">
              {availableModels.map((m) => {
                const guideModel = currentGuide.recommendedModels.find((rm) => rm.id === m)
                const isSelected = settings.model === m

                return (
                  <button
                    key={m}
                    onClick={() => updateSettings({ model: m })}
                    className={cn(
                      'flex w-full items-start justify-between gap-3 p-3 text-left transition hover:bg-surface-2',
                      isSelected && 'bg-surface-2 ring-1 ring-inset ring-accent/30',
                    )}
                  >
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-semibold text-fg truncate">{m}</span>
                        {guideModel?.badge && (
                          <span className="rounded-full bg-accent/15 px-2 py-0.2 text-2xs font-semibold text-accent">
                            {guideModel.badge}
                          </span>
                        )}
                      </div>
                      {guideModel ? (
                        <p className="text-2xs text-muted leading-relaxed">{guideModel.description}</p>
                      ) : (
                        <p className="text-2xs text-faint">Available from {currentGuide.name}</p>
                      )}
                    </div>

                    {isSelected && (
                      <Check size={16} className="text-accent shrink-0 mt-0.5" />
                    )}
                  </button>
                )
              })}

              {availableModels.length === 0 && (
                <div className="p-4 text-center space-y-2">
                  <p className="text-xs text-muted">No models detected yet.</p>
                  <button
                    onClick={testConnection}
                    disabled={testing}
                    className="btn btn-accent text-2xs py-1.5 px-3"
                  >
                    <RefreshCw size={12} className={cn(testing && 'animate-spin')} />
                    Connect & Fetch Models
                  </button>
                </div>
              )}
            </div>

            {/* Custom model input */}
            <div className="space-y-1.5 pt-2">
              <label htmlFor="custom-model-id-input" className="text-2xs font-semibold text-faint">
                Or type any specific model identifier
              </label>
              <div className="flex gap-2">
                <input
                  id="custom-model-id-input"
                  value={settings.model}
                  onChange={(e) => updateSettings({ model: e.target.value })}
                  placeholder="e.g. openai/gpt-oss-20b or llama3.2:3b"
                  className="field font-mono text-xs flex-1"
                  spellCheck={false}
                />
                <button
                  onClick={testConnection}
                  className="btn shrink-0"
                  disabled={testing}
                  title="Test model connection"
                >
                  <RefreshCw size={15} className={cn(testing && 'animate-spin')} />
                </button>
              </div>
            </div>

            <div className="flex justify-between items-center pt-2">
              <button
                onClick={() => setStep(2)}
                className="btn text-xs sm:text-sm"
              >
                &larr; Back to Setup
              </button>
              <button
                onClick={() => setStep(4)}
                className="btn btn-accent text-xs sm:text-sm"
              >
                Voice & Audio &rarr;
              </button>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* STEP 4: VOICE & AUDIO (TEXT-TO-SPEECH)                           */}
        {/* ================================================================= */}
        {step === 4 && (
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-fg">Audio & Text-to-Speech (TTS)</h3>
              <p className="mt-0.5 text-xs text-muted">
                Do you want characters to speak their dialogue aloud using synthetic voices?
              </p>
            </div>

            <div className="rounded-2xl border border-border bg-surface p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <span className="text-xs font-semibold text-fg flex items-center gap-1.5">
                    <Volume2 size={15} className="text-accent" />
                    Enable Text-to-Speech
                  </span>
                  <p className="text-2xs text-muted">
                    Adds voice playback controls to messages in chat.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={settings.ttsEnabled}
                  onChange={(e) => updateSettings({ ttsEnabled: e.target.checked })}
                  className="size-4 rounded accent-accent cursor-pointer"
                />
              </div>

              {settings.ttsEnabled && (
                <div className="pt-3 border-t border-border/60 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-2xs font-semibold uppercase text-muted block mb-1">
                        Voice Provider
                      </label>
                      <select
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
                        className="field text-xs py-1.5"
                      >
                        <option value="pollinations">Pollinations.ai (Free Voice Engine)</option>
                        <option value="google">
                          Google AI Studio (Puck, Kore, etc.){!settings.keyedProviders.includes('google') ? ' — Requires API key' : ''}
                        </option>
                      </select>
                    </div>

                    <div>
                      <label className="text-2xs font-semibold uppercase text-muted block mb-1">
                        Default Voice
                      </label>
                      <select
                        value={settings.ttsDefault?.voice || 'alloy'}
                        onChange={(e) => {
                          updateSettings({
                            ttsDefault: {
                              providerId: settings.ttsDefault?.providerId || 'pollinations',
                              voice: e.target.value,
                            },
                          })
                        }}
                        className="field text-xs py-1.5"
                      >
                        {(settings.ttsDefault?.providerId === 'google'
                          ? GOOGLE_TTS_VOICES
                          : POLLINATIONS_TTS_VOICES
                        ).map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="space-y-2 pt-1">
                    <label className="flex items-center gap-2 cursor-pointer text-xs text-muted hover:text-fg">
                      <input
                        type="checkbox"
                        checked={settings.ttsAutoRead}
                        onChange={(e) => updateSettings({ ttsAutoRead: e.target.checked })}
                        className="size-3.5 rounded accent-accent"
                      />
                      <span>Auto-read assistant dialogue when response completes</span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer text-xs text-muted hover:text-fg">
                      <input
                        type="checkbox"
                        checked={settings.ttsReadNarration}
                        onChange={(e) => updateSettings({ ttsReadNarration: e.target.checked })}
                        className="size-3.5 rounded accent-accent"
                      />
                      <span>Read scene narration aloud (uncheck to speak dialogue only)</span>
                    </label>
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-between items-center pt-2">
              <button onClick={() => setStep(3)} className="btn text-xs sm:text-sm">
                &larr; Back to Model
              </button>
              <button onClick={() => setStep(5)} className="btn btn-accent text-xs sm:text-sm">
                Scene Visuals &rarr;
              </button>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* STEP 5: SCENE VISUALS (IMAGE GENERATION)                         */}
        {/* ================================================================= */}
        {step === 5 && (
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-fg">Scene Visuals & Image Generation</h3>
              <p className="mt-0.5 text-xs text-muted">
                Generate visuals from memorable moments in your chats.
              </p>
            </div>

            <div className="rounded-2xl border border-border bg-surface p-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-2xs font-semibold uppercase text-muted block mb-1">
                    Default Image Provider
                  </label>
                  <select
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
                    className="field text-xs py-1.5"
                  >
                    <option value="pollinations">Pollinations.ai (Flux Family - Free)</option>
                    <option value="google">
                      Google AI Studio (Imagen 3){!settings.keyedProviders.includes('google') ? ' — Requires API key' : ''}
                    </option>
                  </select>
                </div>

                <div>
                  <label className="text-2xs font-semibold uppercase text-muted block mb-1">
                    Image Model
                  </label>
                  <select
                    value={settings.imageDefault?.model || 'flux'}
                    onChange={(e) => {
                      updateSettings({
                        imageDefault: {
                          providerId: settings.imageDefault?.providerId || 'pollinations',
                          model: e.target.value,
                        },
                      })
                    }}
                    className="field text-xs py-1.5"
                  >
                    {(settings.imageDefault?.providerId === 'google'
                      ? GOOGLE_IMAGE_MODELS
                      : POLLINATIONS_IMAGE_MODELS
                    ).map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="rounded-xl border border-border/80 bg-surface-2/60 p-3 text-2xs text-muted leading-relaxed">
                <span className="font-semibold text-fg block mb-0.5">Content Policy Notice:</span>
                Eva text conversations remain completely private and unfiltered. However, image generation strictly blocks sexually explicit content at the application level.
              </div>
            </div>

            <div className="flex justify-between items-center pt-2">
              <button onClick={() => setStep(4)} className="btn text-xs sm:text-sm">
                &larr; Back to Voice
              </button>
              <button onClick={() => setStep(6)} className="btn btn-accent text-xs sm:text-sm">
                Orientation Tour &rarr;
              </button>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* STEP 6: ORIENTATION TOUR                                         */}
        {/* ================================================================= */}
        {step === 6 && (
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-fg">How Eva Works</h3>
              <p className="mt-0.5 text-xs text-muted">
                Here are the core features you can explore right now.
              </p>
            </div>

            <div className="grid gap-2.5 sm:grid-cols-2">
              {ORIENTATION_TIPS.map((t) => (
                <div key={t.title} className="rounded-xl border border-border bg-surface p-3.5 space-y-1">
                  <div className="flex items-center gap-2 text-accent">
                    {t.icon}
                    <h4 className="text-xs font-semibold text-fg">{t.title}</h4>
                  </div>
                  <p className="text-2xs leading-relaxed text-muted">{t.body}</p>
                </div>
              ))}
            </div>

            <div className="rounded-xl border border-border/80 bg-surface-2 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="text-xs text-muted">
                <span className="font-semibold text-fg">All set!</span> Your model is configured and ready.
              </div>
              <button
                onClick={close}
                className="btn btn-accent text-xs sm:text-sm py-2 px-4 flex items-center justify-center gap-1.5"
              >
                <Check size={16} /> Start Chatting
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
