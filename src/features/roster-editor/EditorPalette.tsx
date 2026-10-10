import { CalendarOff, Eraser, MousePointerClick } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { dayKindStyles } from '@/components/dayKindStyles'
import type { EditorShiftType } from '@/data/rosterEditorRepository'
import type { Brush } from '@/domain/rosterPlanning'
import { cn } from '@/ui'

const same = (a: Brush, b: Brush) => a.kind === b.kind && (a.kind !== 'shift' || (b.kind === 'shift' && a.shiftTypeId === b.shiftTypeId))

/** Choose what a tap on a cell does. "Ansehen" never changes anything. */
export function EditorPalette({ brush, onBrush, shiftTypes }: { brush: Brush; onBrush: (b: Brush) => void; shiftTypes: EditorShiftType[] }) {
  const { t } = useTranslation()
  const chip = 'flex h-11 shrink-0 items-center gap-2 rounded-full px-4 text-[14px] font-semibold transition-[background-color,box-shadow,transform] duration-150 active:scale-95'
  return (
    <div role="radiogroup" aria-label={t('editor.tool')} className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
      <button type="button" role="radio" aria-checked={brush.kind === 'inspect'} onClick={() => onBrush({ kind: 'inspect' })}
        className={cn(chip, brush.kind === 'inspect' ? 'bg-text text-surface' : 'bg-surface-2 text-text-2')}>
        <MousePointerClick className="size-[18px]" aria-hidden />
        {t('editor.inspect')}
      </button>
      {shiftTypes.map((st) => {
        const s = dayKindStyles[st.category]
        const b: Brush = { kind: 'shift', shiftTypeId: st.id }
        const active = same(brush, b)
        return (
          <button key={st.id} type="button" role="radio" aria-checked={active} onClick={() => onBrush(b)} title={st.name}
            className={cn(chip, active ? cn(s.solid, 'text-white shadow-sm') : cn(s.soft, s.text))}>
            <span className="text-[15px] font-bold">{st.code}</span>
            <span className="hidden sm:inline">{st.name}</span>
          </button>
        )
      })}
      <button type="button" role="radio" aria-checked={brush.kind === 'off'} onClick={() => onBrush({ kind: 'off' })}
        className={cn(chip, brush.kind === 'off' ? 'bg-off text-white' : 'bg-off-soft text-off-text')}>
        <CalendarOff className="size-[18px]" aria-hidden />
        {t('dayKind.off')}
      </button>
      <button type="button" role="radio" aria-checked={brush.kind === 'erase'} onClick={() => onBrush({ kind: 'erase' })}
        className={cn(chip, brush.kind === 'erase' ? 'bg-danger text-white' : 'bg-danger-soft text-danger-text')}>
        <Eraser className="size-[18px]" aria-hidden />
        {t('wishes.erase')}
      </button>
    </div>
  )
}
