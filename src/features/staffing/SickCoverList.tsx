import { UserSearch } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { dayKindStyles } from '@/components/dayKindStyles'
import type { CoverShift } from '@/domain/staffing'
import { useHospitalFormatter } from '@/features/tenant/useHospitalFormatter'
import { Button, Spinner, cn } from '@/ui'
import { CandidatesSheet } from './CandidatesSheet'
import { useSickLeaveShifts } from './useStaffing'

/** Shifts of a sick colleague that still need cover, with "Vertretung finden". */
export function SickCoverList({ sickLeaveId }: { sickLeaveId: string }) {
  const { t } = useTranslation()
  const fmt = useHospitalFormatter()
  const shifts = useSickLeaveShifts(sickLeaveId, true)
  const [selected, setSelected] = useState<CoverShift | null>(null)

  if (shifts.isLoading) return <Spinner className="size-4 text-text-3" />
  if (!shifts.data?.length) return <p className="text-sm text-text-3">{t('staffing.noShiftsToCover')}</p>

  return (
    <div>
      <p className="mb-2 text-sm font-semibold">{t('staffing.shiftsToCover', { count: shifts.data.length })}</p>
      <ul className="space-y-2">
        {shifts.data.map((s) => (
          <li key={s.entryId} className="flex items-center gap-3 rounded-2xl bg-surface-2/70 px-3 py-2.5">
            <span className={cn('h-9 w-1.5 shrink-0 rounded-full', dayKindStyles[s.category ?? 'other'].solid)} aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-medium">
                {s.shiftName ?? s.shiftCode} · {fmt.dateShort(s.date)}
              </span>
              <span className="block truncate text-sm text-text-3 tabular">
                {fmt.timeRange(s.startsAt, s.endsAt)} · {s.unitName}
              </span>
            </span>
            <Button size="sm" variant="soft" icon={<UserSearch className="size-4" />} onClick={() => setSelected(s)}>
              {t('staffing.findCover')}
            </Button>
          </li>
        ))}
      </ul>
      <CandidatesSheet shift={selected} onClose={() => setSelected(null)} allowRelease />
    </div>
  )
}
