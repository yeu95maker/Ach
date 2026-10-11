'use client'
import { X } from 'lucide-react'
import { useEffect, useRef, type ReactNode } from 'react'

/** Bottom sheet on phones, centred dialog on larger screens (native <dialog>: focus trap + Esc). */
export function Sheet({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose()
      }}
      className="m-0 mt-auto max-h-[92dvh] w-full max-w-none rounded-t-3xl bg-white p-0 shadow-2xl backdrop:bg-black/40 sm:m-auto sm:max-w-lg sm:rounded-3xl"
    >
      {open && (
        <div className="flex max-h-[92dvh] flex-col">
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
            <h2 className="text-lg font-bold text-gray-900">{title}</h2>
            <button type="button" onClick={onClose} aria-label="Close" className="-mr-2 rounded-full p-2 text-gray-500 hover:bg-gray-100">
              <X className="size-5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer && <div className="pb-safe border-t border-gray-100 px-5 pt-3">{footer}</div>}
        </div>
      )}
    </dialog>
  )
}
