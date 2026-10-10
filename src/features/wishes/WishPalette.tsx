import { Eraser } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { WISH_TYPES, type WishType } from '@/domain/wishes'
import { Select, cn } from '@/ui'
import type { ShiftTypeOption } from '@/data/wishRepository'
import { WishIcon, wishStyles } from './wishStyles'

export type Brush = WishType | 'erase'

/** "Paint brush": choose a wish once, then tap any number of days. */
export function WishPalette({
  brush,
  onBrush,
  shiftTypes,
  preferredShiftId,
  onPreferredShift,
}: {
  brush: Brush
  onBrush: (b: Brush) => void
  shiftTypes: ShiftTypeOption[]
  preferredShiftId: string | null
  onPreferredShift: (id: string) => void
}) {
  const { t } = useTranslation()
  return (
    <div className="space-y-2">
      <div role="radiogroup" aria-label={t('wishes.chooseWish')} className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {WISH_TYPES.map((type) => {
          const s = wishStyles[type]
          const active = brush === type
          return (
            <button
              key={type}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onBrush(type)}
              className={cn(
                'flex h-11 shrink-0 items-center gap-2 rounded-full px-4 text-[14px] font-semibold transition-[background-color,box-shadow,transform] duration-150 active:scale-95',
                active ? cn(s.solid, 'text-white shadow-sm') : cn(s.soft, s.text),
              )}
            >
              <WishIcon type={type} className="size-[18px]" />
              {t(`wishTypeShort.${type}`)}
            </button>
          )
        })}
        <button
          type="button"
          role="radio"
          aria-checked={brush === 'erase'}
          onClick={() => onBrush('erase')}
          className={cn(
            'flex h-11 shrink-0 items-center gap-2 rounded-full px-4 text-[14px] font-semibold transition-colors',
            brush === 'erase' ? 'bg-text text-surface' : 'bg-surface-2 text-text-2',
          )}
        >
          <Eraser className="size-[18px]" aria-hidden />
          {t('wishes.erase')}
        </button>
      </div>
      {brush === 'preferred' && (
        <div className="flex items-center gap-3">
          <span className="text-sm text-text-2">{t('wishes.whichShift')}</span>
          <Select aria-label={t('wishes.whichShift')} value={preferredShiftId ?? ''} onChange={(e) => onPreferredShift(e.target.value)} className="h-10 max-w-60 text-sm">
            {shiftTypes.map((st) => (
              <option key={st.id} value={st.id}>
                {st.code} · {st.name}
              </option>
            ))}
          </Select>
        </div>
      )}
    </div>
  )
}
