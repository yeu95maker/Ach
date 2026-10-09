import { X } from 'lucide-react'
import { useEffect, useRef, type ReactNode } from 'react'
import { cn } from './cn'
import { IconButton } from './Button'

/**
 * Modal sheet built on the native <dialog> element (focus trap, Esc, a11y).
 * Phone: slides up from the bottom. Tablet/desktop: centred dialog.
 */
export function Sheet({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  closeLabel,
  size = 'md',
}: {
  open: boolean
  onClose: () => void
  title: ReactNode
  description?: ReactNode
  children: ReactNode
  footer?: ReactNode
  closeLabel: string
  size?: 'md' | 'lg'
}) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) {
      dialog.showModal()
      document.documentElement.style.overflow = 'hidden'
    } else if (!open && dialog.open) {
      dialog.close()
    }
    return () => {
      document.documentElement.style.overflow = ''
    }
  }, [open])

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose() // backdrop click
      }}
      className={cn(
        'fixed m-0 max-h-[92dvh] w-full max-w-none overflow-hidden bg-transparent p-0 text-text backdrop:bg-overlay backdrop:backdrop-blur-[2px]',
        'inset-x-0 top-auto bottom-0 sm:inset-0 sm:m-auto sm:h-fit',
        size === 'lg' ? 'sm:max-w-2xl' : 'sm:max-w-lg',
        'open:animate-sheet-up sm:open:animate-scale-in',
      )}
    >
      {open && (
        <div className="flex max-h-[92dvh] flex-col rounded-t-[28px] border border-border/70 bg-surface shadow-lg sm:rounded-[28px]">
          <div className="mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-border-strong sm:hidden" aria-hidden />
          <div className="flex items-start justify-between gap-4 px-6 pt-4 pb-2 sm:pt-6">
            <div className="min-w-0">
              <h2 className="text-xl font-bold tracking-tight">{title}</h2>
              {description && <p className="mt-1 text-sm text-text-2">{description}</p>}
            </div>
            <IconButton label={closeLabel} onClick={onClose} className="-mt-1 -mr-2">
              <X className="size-5" />
            </IconButton>
          </div>
          <div className="overflow-y-auto px-6 pt-2 pb-6">{children}</div>
          {footer && <div className="border-t border-border/70 px-6 pt-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">{footer}</div>}
        </div>
      )}
    </dialog>
  )
}
