import { cn } from './cn'

export interface SegmentOption<T extends string> {
  value: T
  label: string
}

/** iOS-style segmented control with a sliding thumb. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
}: {
  options: readonly SegmentOption<T>[]
  value: T
  onChange: (value: T) => void
  label: string
  className?: string
}) {
  const index = Math.max(0, options.findIndex((o) => o.value === value))
  return (
    <div role="tablist" aria-label={label} className={cn('relative grid rounded-[14px] bg-surface-3/70 p-1', className)}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      <span
        aria-hidden
        className="absolute inset-y-1 left-1 rounded-[10px] bg-surface shadow-sm transition-transform duration-300 ease-[var(--ease-out-soft)]"
        style={{ width: `calc((100% - 0.5rem) / ${options.length})`, transform: `translateX(${index * 100}%)` }}
      />
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={o.value === value}
          onClick={() => onChange(o.value)}
          className={cn(
            'relative z-10 h-9 rounded-[10px] px-3 text-sm font-semibold transition-colors duration-200',
            o.value === value ? 'text-text' : 'text-text-3 hover:text-text-2',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
