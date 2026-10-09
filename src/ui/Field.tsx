import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { cn } from './cn'

const control =
  'w-full rounded-[var(--radius-control)] border border-border bg-surface-2 px-4 text-[16px] text-text placeholder:text-text-3 ' +
  'transition-[border-color,box-shadow,background-color] duration-150 outline-none ' +
  'hover:border-border-strong focus:border-accent focus:bg-surface focus:shadow-[0_0_0_4px_var(--ring)] ' +
  'disabled:opacity-50 aria-[invalid=true]:border-danger'

export function Field({
  label,
  hint,
  error,
  children,
  htmlFor,
  optional,
  optionalLabel,
}: {
  label: string
  hint?: ReactNode
  error?: string | null
  children: ReactNode
  htmlFor: string
  optional?: boolean
  optionalLabel?: string
}) {
  return (
    <div className="space-y-2">
      <label htmlFor={htmlFor} className="flex items-baseline justify-between text-sm font-medium text-text-2">
        <span>{label}</span>
        {optional && <span className="text-xs font-normal text-text-3">{optionalLabel}</span>}
      </label>
      {children}
      {error ? (
        <p className="text-sm text-danger-text" role="alert">
          {error}
        </p>
      ) : (
        hint && <p className="text-sm text-text-3">{hint}</p>
      )}
    </div>
  )
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cn(control, 'h-12', className)} {...rest} />
})

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className, rows = 3, ...rest },
  ref,
) {
  return <textarea ref={ref} rows={rows} className={cn(control, 'resize-none py-3 leading-relaxed', className)} {...rest} />
})

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, children, ...rest },
  ref,
) {
  return (
    <select
      ref={ref}
      className={cn(
        control,
        'h-12 appearance-none bg-[length:16px] bg-[right_1rem_center] bg-no-repeat pr-10',
        "bg-[url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%238592A8' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")]",
        className,
      )}
      {...rest}
    >
      {children}
    </select>
  )
})

export function useFieldId(prefix: string) {
  return `${prefix}-${useId()}`
}
