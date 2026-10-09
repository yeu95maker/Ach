import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Link, type LinkProps } from 'react-router'
import { cn } from './cn'
import { Spinner } from './Spinner'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent' | 'soft'
export type ButtonSize = 'sm' | 'md' | 'lg'

const base =
  'relative inline-flex select-none items-center justify-center gap-2 rounded-[var(--radius-control)] font-semibold ' +
  'transition-[background-color,box-shadow,transform,color,opacity] duration-150 ease-out ' +
  'active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45 aria-disabled:pointer-events-none aria-disabled:opacity-45'

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-on-primary shadow-sm hover:bg-primary-hover active:bg-primary-pressed',
  accent: 'bg-accent text-white shadow-sm hover:brightness-105 active:brightness-95',
  secondary: 'bg-surface text-text border border-border shadow-sm hover:bg-surface-2 active:bg-surface-3',
  soft: 'bg-primary-soft text-primary-text hover:brightness-[0.97] dark:hover:brightness-125 active:brightness-95',
  ghost: 'text-text-2 hover:bg-surface-2 hover:text-text active:bg-surface-3',
  danger: 'bg-danger text-white shadow-sm hover:brightness-105 active:brightness-95',
}

const sizes: Record<ButtonSize, string> = {
  sm: 'h-10 px-4 text-sm',
  md: 'h-12 px-5 text-[15px]',
  lg: 'h-14 px-6 text-base',
}

export function buttonClasses(variant: ButtonVariant = 'primary', size: ButtonSize = 'md', fullWidth = false, className?: string) {
  return cn(base, variants[variant], sizes[size], fullWidth && 'w-full', className)
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  size?: ButtonSize
  fullWidth?: boolean
  loading?: boolean
  icon?: ReactNode
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', fullWidth, loading, icon, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={buttonClasses(variant, size, fullWidth, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Spinner className="size-[18px]" /> : icon}
      {children}
    </button>
  )
})

type ButtonLinkProps = LinkProps & { variant?: ButtonVariant; size?: ButtonSize; fullWidth?: boolean; icon?: ReactNode }

export function ButtonLink({ variant = 'primary', size = 'md', fullWidth, icon, className, children, ...rest }: ButtonLinkProps) {
  return (
    <Link className={buttonClasses(variant, size, fullWidth, typeof className === 'string' ? className : undefined)} {...rest}>
      {icon}
      {children}
    </Link>
  )
}

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { label: string; variant?: 'ghost' | 'secondary' | 'soft' }

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, variant = 'ghost', className, children, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={cn(base, variants[variant], 'size-11 shrink-0 rounded-full p-0', className)}
      {...rest}
    >
      {children}
    </button>
  )
})
