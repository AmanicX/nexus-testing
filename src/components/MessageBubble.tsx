import { useEffect, useState } from 'react'
import {
  Check,
  Copy,
  Download,
  Loader2,
  RotateCcw,
  Square,
  Trash2,
  Volume2,
} from 'lucide-react'
import type { Character, Message, PerChatConfig } from '@/types'
import { useStore } from '@/store/useStore'
import { Avatar } from './Avatar'
import { MarkdownText, RawText } from './RichText'
import { cn, copyText, download, formatTime } from '@/lib/utils'
import { generateSpeechAudio, ttsPlayer } from '@/lib/tts'
import { getImageBlob } from '@/lib/imageStorage'

interface Props {
  message: Message
  character?: Character
  onDelete?: () => void
  onRegenerate?: () => void
  canRegenerate?: boolean
  streaming?: boolean
  conversationTtsConfig?: PerChatConfig | null
  animate?: boolean
}

export function MessageBubble({
  message,
  character,
  onDelete,
  onRegenerate,
  canRegenerate,
  streaming,
  conversationTtsConfig,
  animate = true,
}: Props) {
  const [copied, setCopied] = useState(false)
  const [ttsLoading, setTtsLoading] = useState(false)
  const [isPlaying, setIsPlaying] = useState(() => ttsPlayer.isPlaying(message.id))
  const [resolvedImageUrl, setResolvedImageUrl] = useState<string>(message.image?.url || '')

  useEffect(() => {
    const img = message.image
    if (!img?.id) return
    let active = true

    getImageBlob(img.id).then((restored) => {
      if (active && restored) {
        setResolvedImageUrl(restored)
      }
    })

    return () => {
      active = false
    }
  }, [message.image])
  const [ttsNotice, setTtsNotice] = useState<string | null>(null)

  const bubbleStyle = useStore((s) => s.settings.bubbleStyle)
  const settings = useStore((s) => s.settings)
  const isUser = message.role === 'user'
  const isEmptyStreaming = Boolean(streaming && !message.content)

  useEffect(() => {
    const unsub = ttsPlayer.addListener((id) => {
      setIsPlaying(id === message.id)
    })
    return () => unsub()
  }, [message.id])

  const handleCopy = async () => {
    await copyText(isUser ? message.raw ?? message.content : message.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 1400)
  }

  const handleToggleSpeech = async () => {
    if (isPlaying) {
      ttsPlayer.stop()
      return
    }

    setTtsNotice(null)
    setTtsLoading(true)

    try {
      const preferred = conversationTtsConfig?.providerId
        ? {
            providerId: conversationTtsConfig.providerId,
            voice: conversationTtsConfig.voice || 'alloy',
          }
        : null

      const { audioUrl } = await generateSpeechAudio(
        message.content,
        preferred,
        settings,
      )

      ttsPlayer.play(message.id, audioUrl)
    } catch (err) {
      setTtsNotice(err instanceof Error ? err.message : 'Speech playback failed.')
      setTimeout(() => setTtsNotice(null), 3500)
    } finally {
      setTtsLoading(false)
    }
  }

  if (isUser) {
    return (
      <div className={cn('group flex flex-col items-end gap-1', animate && 'anim-rise')}>
        <div className="bubble-user max-w-[85%] rounded-2xl rounded-br-sm px-4 py-2.5 text-sm leading-relaxed [overflow-wrap:anywhere] sm:max-w-[75%] shadow-sm">
          <RawText text={message.raw ?? message.content} />
        </div>
        <div className="flex items-center gap-1.5 pr-1 opacity-100 transition pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 pointer-fine:group-focus-within:opacity-100">
          <span className="px-1 text-2xs text-faint tabular-nums">
            {formatTime(message.timestamp)}
          </span>
          <button
            onClick={handleCopy}
            className="grid size-7 place-items-center rounded-lg text-faint transition hover:bg-surface-2 hover:text-fg"
            aria-label="Copy message"
            title="Copy message"
          >
            {copied ? <Check size={13} className="text-accent" /> : <Copy size={13} />}
          </button>
          {onDelete && (
            <button
              onClick={onDelete}
              className="grid size-7 place-items-center rounded-lg text-faint transition hover:bg-surface-2 hover:text-danger"
              aria-label="Delete message"
              title="Delete message"
            >
              <Trash2 size={13} />
            </button>
          )}
        </div>
      </div>
    )
  }

  // Handle Image Message
  if (message.type === 'image' && message.image) {
    return (
      <div className={cn('group flex items-start gap-3', animate && 'anim-rise')}>
        <Avatar
          name={character?.name ?? 'Eva'}
          avatar={character?.avatar}
          color={character?.avatarColor}
          size={34}
          className="mt-0.5 shrink-0"
        />
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-2 pl-0.5">
            <span className="text-xs font-semibold text-fg">
              {character?.name ?? 'Assistant'}
            </span>
            <span className="rounded bg-accent/15 px-1.5 py-0.2 text-2xs text-accent border border-accent/30 font-medium">
              Generated image
            </span>
            {message.image.model && (
              <span className="rounded bg-surface-2 px-1.5 py-0.2 text-2xs text-faint border border-border">
                {message.image.model}
              </span>
            )}
          </div>

          <div className="overflow-hidden rounded-2xl border border-border/80 bg-surface/60 max-w-lg shadow-lg">
            <img
              src={resolvedImageUrl || message.image.url}
              alt={message.image.prompt}
              className="w-full h-auto max-h-[460px] object-cover transition-transform duration-300 hover:scale-[1.01]"
              loading="lazy"
              onError={() => {
                if (message.image?.id) {
                  void getImageBlob(message.image.id).then((restored) => {
                    if (restored) setResolvedImageUrl(restored)
                  })
                }
              }}
            />
            <div className="p-3 border-t border-border/60">
              <p className="text-xs text-muted leading-relaxed select-text italic">
                "{message.image.prompt}"
              </p>
            </div>
          </div>

          <div className="mt-1 flex items-center gap-1.5 pl-0.5 opacity-100 transition pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 pointer-fine:group-focus-within:opacity-100">
            <span className="px-1 text-2xs text-faint tabular-nums">
              {formatTime(message.timestamp)}
            </span>
            <button
              onClick={() => {
                const targetUrl = resolvedImageUrl || message.image!.url
                void download(`eva-scene-${message.id}`, targetUrl)
              }}
              className="grid size-7 place-items-center rounded-lg text-faint transition hover:bg-surface-2 hover:text-fg"
              aria-label="Download image"
              title="Download image"
            >
              <Download size={13} />
            </button>
            <button
              onClick={() => copyText(message.image!.prompt)}
              className="grid size-7 place-items-center rounded-lg text-faint transition hover:bg-surface-2 hover:text-fg"
              aria-label="Copy prompt"
              title="Copy prompt"
            >
              <Copy size={13} />
            </button>
            {onDelete && (
              <button
                onClick={onDelete}
                className="grid size-7 place-items-center rounded-lg text-faint transition hover:bg-surface-2 hover:text-danger"
                aria-label="Delete message"
                title="Delete message"
              >
                <Trash2 size={13} />
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  // Assistant Message (Bubble vs Document style)
  const isDocument = bubbleStyle === 'document'

  return (
    <div className={cn('group flex items-start gap-3', animate && 'anim-rise')}>
      <Avatar
        name={character?.name ?? 'AI'}
        avatar={character?.avatar}
        color={character?.avatarColor}
        size={34}
        className="mt-0.5 shrink-0"
      />
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center gap-2 pl-0.5">
          <span className="text-xs font-semibold text-fg">
            {character?.name ?? 'Assistant'}
          </span>
          {character?.source && (
            <span className="rounded bg-surface-2 px-1.5 py-0.2 text-2xs text-faint border border-border">
              {character.source}
            </span>
          )}
        </div>

        <div
          className={cn(
            'inline-block max-w-[95%] text-sm leading-relaxed [overflow-wrap:anywhere]',
            isDocument
              ? 'px-1 py-1 text-fg'
              : 'bubble-bot rounded-2xl rounded-tl-sm px-4 py-2.5 shadow-sm',
            message.error && 'border border-danger/40 bg-danger/10 text-fg',
          )}
        >
          {isEmptyStreaming ? (
            <div className="flex flex-col items-center justify-center py-4 px-6 gap-2">
              <div className="size-5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
              <span className="text-xs font-medium text-muted tracking-wide animate-pulse">
                Responding
              </span>
            </div>
          ) : (
            <MarkdownText text={message.content} />
          )}
        </div>

        {ttsNotice && (
          <p className="mt-1 text-2xs text-danger/90 italic pl-1">{ttsNotice}</p>
        )}

        {!isEmptyStreaming && (
          <div className="mt-1 flex items-center gap-1.5 pl-0.5 opacity-100 transition pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 pointer-fine:group-focus-within:opacity-100">
            <span className="px-1 text-2xs text-faint tabular-nums">
              {formatTime(message.timestamp)}
            </span>
            <button
              onClick={handleCopy}
              className="grid size-7 place-items-center rounded-lg text-faint transition hover:bg-surface-2 hover:text-fg"
              aria-label="Copy message"
              title="Copy message"
            >
              {copied ? <Check size={13} className="text-accent" /> : <Copy size={13} />}
            </button>
            {/* TTS Speaker button */}
            <button
              onClick={handleToggleSpeech}
              disabled={ttsLoading}
              className={cn(
                'grid size-7 place-items-center rounded-lg transition hover:bg-surface-2',
                isPlaying ? 'text-accent' : 'text-faint hover:text-fg',
              )}
              aria-label={isPlaying ? 'Stop speech' : 'Read aloud'}
              title={isPlaying ? 'Stop speech' : 'Read aloud'}
            >
              {ttsLoading ? (
                <Loader2 size={13} className="animate-spin text-accent" />
              ) : isPlaying ? (
                <Square size={13} className="fill-current" />
              ) : (
                <Volume2 size={13} />
              )}
            </button>
            {canRegenerate && onRegenerate && (
              <button
                onClick={onRegenerate}
                className="grid size-7 place-items-center rounded-lg text-faint transition hover:bg-surface-2 hover:text-fg"
                aria-label="Regenerate reply"
                title="Regenerate reply"
              >
                <RotateCcw size={13} />
              </button>
            )}
            {onDelete && (
              <button
                onClick={onDelete}
                className="grid size-7 place-items-center rounded-lg text-faint transition hover:bg-surface-2 hover:text-danger"
                aria-label="Delete message"
                title="Delete message"
              >
                <Trash2 size={13} />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
