import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion, useDragControls, useReducedMotion } from 'motion/react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { springDrawer, springModal } from '@/lib/motion'

interface ModalProps {
  open: boolean
  onClose: () => void
  children: ReactNode
  title?: ReactNode
  subtitle?: ReactNode
  icon?: ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
  footer?: ReactNode
  bodyClassName?: string
  hideCloseButton?: boolean
  fitKeyboard?: boolean
}

const SIZES: Record<NonNullable<ModalProps['size']>, string> = {
  sm: 'sm:max-w-md',
  md: 'sm:max-w-xl',
  lg: 'sm:max-w-3xl',
  xl: 'sm:max-w-4xl',
}

export function Modal({
  open,
  onClose,
  children,
  title,
  subtitle,
  icon,
  size = 'md',
  footer,
  bodyClassName,
  hideCloseButton = false,
  fitKeyboard = false,
}: ModalProps) {
  const dragControls = useDragControls()
  const modalRef = useRef<HTMLDivElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const previousActiveElementRef = useRef<HTMLElement | null>(null)
  const titleId = useId()
  const subtitleId = useId()
  const prefersReduced = useReducedMotion()

  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.innerWidth < 640
  })

  useEffect(() => {
    if (typeof window === 'undefined') return
    const mq = window.matchMedia('(max-width: 639px)')
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  // Opt-in for editors: Android/WebView keyboards can shrink only visualViewport.
  // https://developer.mozilla.org/en-US/docs/Web/API/VisualViewport
  useEffect(() => {
    if (!open || !fitKeyboard || !window.visualViewport) return
    const viewport = window.visualViewport
    const update = () => {
      if (!viewportRef.current || !modalRef.current) return
      Object.assign(viewportRef.current.style, {
        top: `${viewport.offsetTop}px`, height: `${viewport.height}px`, bottom: 'auto',
      })
      modalRef.current.style.maxHeight = `${viewport.height * (window.innerWidth < 640 ? 0.96 : 0.88)}px`
    }
    update()
    viewport.addEventListener('resize', update)
    viewport.addEventListener('scroll', update)
    return () => {
      viewport.removeEventListener('resize', update)
      viewport.removeEventListener('scroll', update)
    }
  }, [open, fitKeyboard])

  useEffect(() => {
    if (!open) return
    previousActiveElementRef.current = document.activeElement as HTMLElement | null

    const timer = setTimeout(() => {
      if (modalRef.current) {
        const focusable = Array.from(
          modalRef.current.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
          ),
        ).filter((el) => el.offsetParent !== null)
        if (focusable.length > 0) {
          const initialFocus = focusable.find((el) => !el.dataset.dragHandle) || focusable[0]
          initialFocus.focus()
        } else {
          modalRef.current.focus()
        }
      }
    }, 50)

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }

      if (e.key === 'Tab' && modalRef.current) {
        const focusable = Array.from(
          modalRef.current.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
          ),
        ).filter((el) => el.offsetParent !== null)

        if (focusable.length === 0) {
          e.preventDefault()
          return
        }

        const first = focusable[0]
        const last = focusable[focusable.length - 1]

        if (e.shiftKey) {
          if (document.activeElement === first || document.activeElement === modalRef.current) {
            e.preventDefault()
            last.focus()
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault()
            first.focus()
          }
        }
      }
    }

    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      clearTimeout(timer)
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
      if (previousActiveElementRef.current) {
        previousActiveElementRef.current.focus()
      }
    }
  }, [open, onClose])

  return createPortal(
    <AnimatePresence>
      {open && (
        <div ref={viewportRef} className="fixed inset-0 z-[100] flex items-end justify-center overflow-hidden sm:items-center sm:p-6">
          <motion.div
            className="absolute inset-0 bg-black/65 sm:bg-black/60 sm:backdrop-blur-xs"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            onClick={onClose}
          />
          <motion.div
            ref={modalRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? titleId : undefined}
            aria-describedby={subtitle ? subtitleId : undefined}
            drag={isMobile && !prefersReduced ? 'y' : false}
            dragControls={dragControls}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.4 }}
            onDragEnd={(_e, info) => {
              if (info.offset.y > 80 || info.velocity.y > 300) {
                onClose()
              }
            }}
            initial={
              prefersReduced
                ? { opacity: 0 }
                : isMobile
                  ? { y: '100%' }
                  : { opacity: 0, scale: 0.96 }
            }
            animate={
              prefersReduced
                ? { opacity: 1 }
                : isMobile
                  ? { y: 0 }
                  : { opacity: 1, scale: 1 }
            }
            exit={
              prefersReduced
                ? { opacity: 0 }
                : isMobile
                  ? { y: '100%' }
                  : { opacity: 0, scale: 0.96 }
            }
            transition={
              prefersReduced
                ? { duration: 0.15 }
                : isMobile
                  ? springDrawer
                  : springModal
            }
            className={cn(
              'modal-glass relative z-10 flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl shadow-2xl sm:my-auto sm:max-h-[88dvh] sm:rounded-2xl border border-border/80 outline-none',
              SIZES[size],
            )}
          >
            {/* Mobile drag handle / keyboard-accessible dismissal */}
            <button
              type="button"
              data-drag-handle="true"
              onPointerDown={(e) => dragControls.start(e)}
              onClick={onClose}
              className="group flex w-full flex-col items-center justify-center pt-3 pb-2 px-6 cursor-pointer sm:hidden select-none touch-none border-0 bg-transparent outline-none focus-visible:outline-2 focus-visible:outline-accent active:opacity-70 transition-opacity"
              aria-label="Tap, drag down or press Enter to dismiss"
              title="Tap, drag down or press Enter to dismiss"
            >
              <span className="h-1.5 w-12 rounded-full bg-border-strong group-hover:bg-fg/50 group-active:bg-accent group-focus-visible:ring-2 group-focus-visible:ring-accent transition-colors" />
            </button>

            {(title || icon) && (
              <div
                onPointerDown={(e) => {
                  const target = e.target as HTMLElement
                  if (!target.closest('button, a, input, select')) {
                    dragControls.start(e)
                  }
                }}
                onClick={(e) => {
                  const target = e.target as HTMLElement
                  if (!target.closest('button, a, input, select') && window.innerWidth < 640) {
                    onClose()
                  }
                }}
                className="flex items-start gap-3 border-b border-border px-5 py-3 sm:px-6 cursor-pointer sm:cursor-auto select-none sm:select-auto touch-none sm:touch-auto"
              >
                {icon && (
                  <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent-grad text-accent-fg shadow-md">
                    {icon}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  {title && (
                    <h2
                      id={titleId}
                      className="font-display text-base font-semibold tracking-tight text-fg"
                    >
                      {title}
                    </h2>
                  )}
                  {subtitle && (
                    <p id={subtitleId} className="mt-0.5 text-xs text-muted">
                      {subtitle}
                    </p>
                  )}
                </div>
                {!hideCloseButton && (
                  <button
                    onClick={onClose}
                    className="btn btn-ghost -mr-1.5 -mt-1 hidden sm:grid size-8 shrink-0 place-items-center rounded-lg p-0 text-faint hover:text-fg"
                    aria-label="Close"
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
            )}

            <div
              className={cn(
                'scroll-thin flex-1 overflow-y-auto px-5 py-5 sm:px-6',
                bodyClassName,
              )}
            >
              {children}
            </div>

            {footer && (
              <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border/80 material px-5 py-3 sm:px-6">
                {footer}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
