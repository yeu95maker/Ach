import { useQuery } from '@tanstack/react-query'
import { Thermometer, UsersRound } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { dayKindStyles } from '@/components/dayKindStyles'
import { QueryError, Stagger } from '@/components/QueryState'
import { PersonAvatar } from '@/components/PersonAvatar'
import { teamRepository } from '@/data/teamRepository'
import { isoDateInTimeZone } from '@/domain/dates'
import type { RosterEntry } from '@/domain/types'
import { queryKeys } from '@/features/queryKeys'
import { useEmployment } from '@/features/tenant/TenantProvider'
import { useHospitalFormatter } from '@/features/tenant/useHospitalFormatter'
import { Card, EmptyState, SectionTitle, SegmentedControl, SkeletonCard, cn } from '@/ui'
import { ColleagueCard } from './ColleagueCard'
import { useColleagueSickLeaves } from './useColleagueSickLeaves'

export function OnDutyTab() {
  const { t } = useTranslation()
  const employment = useEmployment()
  const fmt = useHospitalFormatter()
  const myUnits = useMemo(() => new Set(employment.units.map((u) => u.id)), [employment.units])
  const [scope, setScope] = useState<'mine' | 'all'>(myUnits.size ? 'mine' : 'all')

  const today = isoDateInTimeZone(new Date(), employment.hospital.timezone)
  const sick = useColleagueSickLeaves(today)
  const { isSickOn } = sick

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: queryKeys.onDuty(employment.hospital.id),
    queryFn: () => teamRepository.fetchOnDuty(employment.hospital.id, new Date()),
    refetchInterval: 60_000,
  })

  const groups = useMemo(() => {
    // Colleagues reported sick are listed separately, never as "on duty".
    const visible = (data ?? []).filter(
      (e) => e.employeeId !== employment.employeeId && (scope === 'all' || myUnits.has(e.unitId)) && !isSickOn(e.employeeId, e.date),
    )
    const map = new Map<string, RosterEntry[]>()
    for (const e of visible) map.set(e.unitName, [...(map.get(e.unitName) ?? []), e])
    return [...map.entries()]
  }, [data, scope, myUnits, employment.employeeId, isSickOn])

  const sickToday = (sick.data ?? []).filter((s) => s.employeeId !== employment.employeeId)

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

      {sickToday.length > 0 && (
        <section aria-labelledby="sick-today">
          <SectionTitle>
            <span id="sick-today">
              {t('team.sickToday')} · {sickToday.length}
            </span>
          </SectionTitle>
          <Card padding="sm" className="flex flex-wrap gap-2 sm:p-4">
            {sickToday.map((s) => (
              <span key={s.id} className="flex items-center gap-2.5 rounded-full bg-sick-soft py-1 pr-3.5 pl-1 text-sick-text">
                {s.person && <PersonAvatar person={s.person} size="sm" />}
                <span className="text-sm font-semibold">{s.person ? `${s.person.firstName} ${s.person.lastName}` : '—'}</span>
                <span className="flex items-center gap-1 text-[13px] opacity-80">
                  <Thermometer className="size-3.5" aria-hidden />
                  {t('team.sickUntil', { date: fmt.dateShort(s.endDate) })}
                </span>
              </span>
            ))}
          </Card>
          <p className="mt-2 px-1 text-xs text-text-3">{t('team.sickPrivacyHint')}</p>
        </section>
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
