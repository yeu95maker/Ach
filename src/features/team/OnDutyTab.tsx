import { useQuery } from '@tanstack/react-query'
import { UsersRound } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { dayKindStyles } from '@/components/dayKindStyles'
import { QueryError, Stagger } from '@/components/QueryState'
import { teamRepository } from '@/data/teamRepository'
import type { RosterEntry } from '@/domain/types'
import { queryKeys } from '@/features/queryKeys'
import { useEmployment } from '@/features/tenant/TenantProvider'
import { useHospitalFormatter } from '@/features/tenant/useHospitalFormatter'
import { EmptyState, SectionTitle, SegmentedControl, SkeletonCard, cn } from '@/ui'
import { ColleagueCard } from './ColleagueCard'

export function OnDutyTab() {
  const { t } = useTranslation()
  const employment = useEmployment()
  const fmt = useHospitalFormatter()
  const myUnits = useMemo(() => new Set(employment.units.map((u) => u.id)), [employment.units])
  const [scope, setScope] = useState<'mine' | 'all'>(myUnits.size ? 'mine' : 'all')

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: queryKeys.onDuty(employment.hospital.id),
    queryFn: () => teamRepository.fetchOnDuty(employment.hospital.id, new Date()),
    refetchInterval: 60_000,
  })

  const groups = useMemo(() => {
    const visible = (data ?? []).filter((e) => e.employeeId !== employment.employeeId && (scope === 'all' || myUnits.has(e.unitId)))
    const map = new Map<string, RosterEntry[]>()
    for (const e of visible) map.set(e.unitName, [...(map.get(e.unitName) ?? []), e])
    return [...map.entries()]
  }, [data, scope, myUnits, employment.employeeId])

  return (
    <div className="space-y-6">
      {myUnits.size > 0 && (
        <SegmentedControl
          label={t('team.scope')}
          className="w-full max-w-xs"
          value={scope}
          onChange={setScope}
          options={[
            { value: 'mine', label: t('team.myUnit') },
            { value: 'all', label: t('team.wholeHospital') },
          ]}
        />
      )}

      {isLoading && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => <SkeletonCard key={i} lines={2} />)}
        </div>
      )}
      {error && <QueryError error={error} onRetry={() => void refetch()} />}
      {data && groups.length === 0 && <EmptyState icon={<UsersRound />} title={t('team.nobodyOnDuty')} description={t('team.nobodyOnDutyHint')} />}

      {groups.map(([unit, entries]) => (
        <section key={unit}>
          <SectionTitle>
            {unit} · {entries.length}
          </SectionTitle>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {entries.map((e, i) => {
              const kind = e.shiftType?.category ?? 'other'
              return (
                <Stagger key={e.id} index={i}>
                  <ColleagueCard
                    person={{
                      firstName: e.person?.firstName ?? '',
                      lastName: e.person?.lastName ?? '',
                      avatarPath: e.person?.avatarPath ?? null,
                      jobTitle: e.person?.jobTitle ?? '',
                      unitName: e.unitName,
                      qualifications: e.person?.qualifications ?? [],
                    }}
                    trailing={
                      e.startsAt &&
                      e.endsAt && (
                        <span className={cn('shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold tabular', dayKindStyles[kind].soft, dayKindStyles[kind].text)}>
                          {e.shiftType?.code ? `${e.shiftType.code} · ` : ''}
                          {t('team.until', { time: fmt.time(e.endsAt) })}
                        </span>
                      )
                    }
                  />
                </Stagger>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}
