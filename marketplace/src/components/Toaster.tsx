'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'

export interface ToastInput {
  text: string
  tone?: 'info' | 'error' | 'success'
  action?: { label: string; href: string }
}

/** Fire-and-forget notifications (e.g. "Saved", "Limit reached – go Premium"). */
export function toast(input: ToastInput | string) {
  window.dispatchEvent(new CustomEvent<ToastInput>('app-toast', { detail: typeof input === 'string' ? { text: input } : input }))
}

export function Toaster() {
  const [items, setItems] = useState<(ToastInput & { id: number })[]>([])
  useEffect(() => {
    const onToast = (e: Event) => {
      const detail = (e as CustomEvent<ToastInput>).detail
      const id = Date.now() + Math.random()
      setItems((list) => [...list.slice(-2), { ...detail, id }])
      setTimeout(() => setItems((list) => list.filter((x) => x.id !== id)), detail.action ? 7000 : 3500)
    }
    window.addEventListener('app-toast', onToast)
    return () => window.removeEventListener('app-toast', onToast)
  }, [])
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex flex-col items-center gap-2 px-4 md:bottom-6">
      {items.map((item) => (
        <div
          key={item.id}
          className={`pointer-events-auto flex max-w-md items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-white shadow-lg ${
            item.tone === 'error' ? 'bg-red-700' : item.tone === 'success' ? 'bg-brand-700' : 'bg-gray-900'
          }`}
        >
          <span>{item.text}</span>
          {item.action && (
            <Link href={item.action.href} className="shrink-0 font-bold text-gold-100 underline">
              {item.action.label}
            </Link>
          )}
        </div>
      ))}
    </div>
  )
}
