import clsx, { type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'
import Link from 'next/link'
import type { ComponentProps, ReactNode } from 'react'

const twMerge = extendTailwindMerge({ extend: { classGroups: { 'font-size': [{ text: ['[15px]', '[13px]', '[11px]', '[10px]'] }] } } })
/** clsx + tailwind-merge: later classes (e.g. a className prop) win over defaults. */
export const cn = (...v: ClassValue[]) => twMerge(clsx(v))

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'premium'
type Size = 'sm' | 'md' | 'lg'

const variants: Record<Variant, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 disabled:bg-brand-600/50',
  secondary: 'bg-white text-gray-900 ring-1 ring-gray-300 hover:bg-gray-50 disabled:text-gray-400',
  ghost: 'text-brand-700 hover:bg-brand-50 disabled:text-gray-400',
  danger: 'bg-red-600 text-white hover:bg-red-700 disabled:bg-red-600/50',
  premium: 'bg-gray-900 text-gold-100 hover:bg-black disabled:bg-gray-900/50',
}
const sizes: Record<Size, string> = {
  sm: 'h-9 px-3 text-sm',
  md: 'h-11 px-4 text-[15px]',
  lg: 'h-13 px-5 text-base',
}

export function buttonClass(variant: Variant = 'primary', size: Size = 'md', block = false) {
  return cn(
    'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 disabled:cursor-not-allowed',
    variants[variant],
    sizes[size],
    block && 'w-full',
  )
}

export function Button({
  variant = 'primary', size = 'md', block, className, type = 'button', ...props
}: ComponentProps<'button'> & { variant?: Variant; size?: Size; block?: boolean }) {
  return <button type={type} className={cn(buttonClass(variant, size, block), className)} {...props} />
}

export function LinkButton({
  variant = 'primary', size = 'md', block, className, ...props
}: ComponentProps<typeof Link> & { variant?: Variant; size?: Size; block?: boolean }) {
  return <Link className={cn(buttonClass(variant, size, block), className)} {...props} />
}

export function Card({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('rounded-2xl bg-white shadow-sm ring-1 ring-gray-200/70', className)} {...props} />
}

export function Field({ label, hint, error, children, className }: { label: ReactNode; hint?: ReactNode; error?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cn('block', className)}>
      <span className="mb-1.5 block text-sm font-medium text-gray-700">{label}</span>
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-gray-500">{hint}</span>}
      {error && <span className="mt-1 block text-xs font-medium text-red-600">{error}</span>}
    </label>
  )
}

export const inputClass =
  'block h-11 w-full rounded-xl border-0 bg-white px-3 text-[15px] text-gray-900 ring-1 ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-brand-600 focus:outline-none disabled:bg-gray-50'

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input className={cn(inputClass, className)} {...props} />
}

export function Select({ className, ...props }: ComponentProps<'select'>) {
  return <select className={cn(inputClass, 'pr-8', className)} {...props} />
}

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return <textarea className={cn(inputClass, 'h-auto min-h-28 py-2.5', className)} {...props} />
}

export function Badge({ tone = 'gray', className, ...props }: ComponentProps<'span'> & { tone?: 'gray' | 'green' | 'gold' | 'red' | 'blue' | 'dark' }) {
  const tones = {
    gray: 'bg-gray-100 text-gray-700',
    green: 'bg-brand-50 text-brand-700 ring-1 ring-brand-200',
    gold: 'bg-gold-100 text-gold-700',
    red: 'bg-red-50 text-red-700',
    blue: 'bg-sky-50 text-sky-700',
    dark: 'bg-gray-900/85 text-white',
  }
  return <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold', tones[tone], className)} {...props} />
}

export function PageHeader({ title, subtitle, action, back }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode; back?: string }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div className="min-w-0">
        {back && (
          <Link href={back} className="mb-1 inline-block text-sm font-medium text-brand-700">
            ←
          </Link>
        )}
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-gray-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

export function EmptyState({ icon, title, text, action }: { icon?: ReactNode; title: ReactNode; text?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-gray-300 bg-white px-6 py-10 text-center">
      {icon && <div className="mb-3 text-gray-400">{icon}</div>}
      <p className="font-semibold text-gray-900">{title}</p>
      {text && <p className="mt-1 max-w-sm text-sm text-gray-500">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function Alert({ tone = 'info', children, className }: { tone?: 'info' | 'warning' | 'error' | 'success'; children: ReactNode; className?: string }) {
  const tones = {
    info: 'bg-sky-50 text-sky-900 ring-sky-200',
    warning: 'bg-amber-50 text-amber-900 ring-amber-200',
    error: 'bg-red-50 text-red-800 ring-red-200',
    success: 'bg-brand-50 text-brand-800 ring-brand-200',
  }
  return <div role={tone === 'error' ? 'alert' : 'status'} className={cn('rounded-xl px-4 py-3 text-sm ring-1', tones[tone], className)}>{children}</div>
}
