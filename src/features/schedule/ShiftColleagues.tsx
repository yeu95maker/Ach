import { UsersRound } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { PersonAvatar } from '@/components/PersonAvatar'
import { QueryError } from '@/components/QueryState'
import { dayKindStyles } from '@/components/dayKindStyles'
import type { RosterEntry } from '@/domain/types'
import { useHospitalFormatter } from '@/features/tenant/useHospitalFormatter'
import { EmptyState, Skeleton, cn } from '@/ui'
import { useShiftColleagues } from './useSchedule'

export function ShiftColleagues({ entry }: { entry: RosterEntry }) {
  const { t } = useTranslation()
  const fmt = useHospitalFormatter()
  const { data, isLoading, error, refetch } = useShiftColleagues(entry)

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="size-11 rounded-full" />
            <Skeleton className="h-4 w-40" />
          </div>
        ))}
      </div>
    )
  }
  if (error) return <QueryError compact error={error} onRetry={() => void refetch()} />
  if (!data?.length) return <EmptyState compact icon={<UsersRound />} title={t('schedule.noColleagues')} />

  return (
    <ul className="space-y-1">
      {data.map((c) => {
        const kind = c.shiftType?.category ?? 'other'
        return (
          <li key={c.id} className="flex items-center gap-3 rounded-2xl px-2 py-2">
            {c.person && <PersonAvatar person={c.person} />}
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-semibold">
                {c.person ? `${c.person.firstName} ${c.person.lastName}` : t('schedule.openShift')}
              </p>
              <p className="truncate text-sm text-text-3">
                {c.person?.jobTitle}
                {c.person?.qualifications.length ? ` · ${c.person.qualifications.map((q) => q.code).join(', ')}` : ''}
              </p>
            </div>
            {c.startsAt && c.endsAt && (
              <span className={cn('rounded-full px-2.5 py-1 text-xs font-semibold tabular', dayKindStyles[kind].soft, dayKindStyles[kind].text)}>
                {fmt.timeRange(c.startsAt, c.endsAt)}
              </span>
            )}
          </li>
        )
      })}
    </ul>
  )
}
