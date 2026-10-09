import { CheckCircle2, AlertTriangle, Info, XCircle } from 'lucide-react'
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import { cn } from './cn'

type ToastTone = 'success' | 'error' | 'info' | 'warning'
type ToastItem = { id: number; tone: ToastTone; title: string; description?: string }

type ToastApi = { show: (toast: Omit<ToastItem, 'id'>) => void }

const ToastContext = createContext<ToastApi | null>(null)

const icons = {
  success: <CheckCircle2 className="size-5 text-success" />,
  error: <XCircle className="size-5 text-danger" />,
  warning: <AlertTriangle className="size-5 text-warning" />,
  info: <Info className="size-5 text-accent" />,
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const counter = useRef(0)

  const show = useCallback((toast: Omit<ToastItem, 'id'>) => {
    const id = ++counter.current
    setItems((prev) => [...prev.slice(-2), { ...toast, id }])
    window.setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), 4200)
  }, [])

  const api = useMemo(() => ({ show }), [show])

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex flex-col items-center gap-2 px-4 pt-[max(1rem,env(safe-area-inset-top))] sm:items-end sm:pr-6"
      >
        {items.map((t) => (
          <div
            key={t.id}
            role={t.tone === 'error' ? 'alert' : 'status'}
            className={cn(
              'pointer-events-auto flex w-full max-w-sm animate-scale-in items-start gap-3 rounded-2xl border border-border/70 bg-surface/95 p-4 shadow-lg backdrop-blur-xl',
            )}
          >
            {icons[t.tone]}
            <div className="min-w-0">
              <p className="text-[15px] font-semibold text-text">{t.title}</p>
              {t.description && <p className="mt-0.5 text-sm text-text-2">{t.description}</p>}
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside ToastProvider')
  return ctx
}
