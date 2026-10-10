import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Check, Clock3, Info, Plus, Search, Settings2, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useSearchParams } from 'react-router'
import { PersonAvatar } from '@/components/PersonAvatar'
import { QueryError } from '@/components/QueryState'
import { errorMessageKey } from '@/core/errors'
import { teamRepository } from '@/data/teamRepository'
import { wishRepository, type WishOverviewItem } from '@/data/wishRepository'
import { fromISODate, isoDateInTimeZone, monthGrid } from '@/domain/dates'
import type { ISODate, RosterEntry } from '@/domain/types'
import { compareWithPlan, WISH_STATUSES, WISH_TYPES, type WishPeriod, type WishStatus, type WishType } from '@/domain/wishes'
import { queryKeys } from '@/features/queryKeys'
import { useEmployment } from '@/features/tenant/TenantProvider'
import { useHospitalFormatter } from '@/features/tenant/useHospitalFormatter'
import { Badge, Button, Card, EmptyState, Input, PageHeader, SegmentedControl, Select, SkeletonCard, cn, useToast } from '@/ui'
import { PeriodSheet } from './PeriodSheet'
import { useWishPeriods, useWishScope } from './useWishes'
import { WishMatrix, type MatrixRow } from './WishMatrix'
import { WishReviewSheet } from './WishReviewSheet'
import { WishPill, WishStatusBadge } from './wishStyles'

const monthKey = (iso: ISODate) => iso.slice(0, 7)

function useManagementData(periodIds: string[], unitIds: string[], from: ISODate, to: ISODate) {
  const employment = useEmployment()
  const overview = useQuery({
    queryKey: queryKeys.wishOverview(periodIds),
    queryFn: () => wishRepository.fetchOverview(periodIds),
    enabled: periodIds.length > 0,
  })
  const planned = useQuery({
    queryKey: queryKeys.wishPlanned(unitIds, from, to),
    queryFn: () => wishRepository.fetchPlanned(unitIds, from, to),
    enabled: unitIds.length > 0,
  })
  const members = useQuery({
    queryKey: queryKeys.unitMembers(unitIds),
    queryFn: () => wishRepository.fetchUnitMembers(unitIds),
    enabled: unitIds.length > 0,
  })
  const directory = useQuery({
    queryKey: queryKeys.directory(employment.hospital.id),
    queryFn: () => teamRepository.fetchDirectory(employment.hospital.id),
  })
  return { overview, planned, members, directory }
}

export function WishManagementPage() {
  const { t } = useTranslation()
  const employment = useEmployment()
  const fmt = useHospitalFormatter()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [params, setParams] = useSearchParams()
  const today = isoDateInTimeZone(new Date(), employment.hospital.timezone)

  const scope = useWishScope()
  const periods = useWishPeriods()
  const units = useQuery({ queryKey: queryKeys.wishUnits(employment.hospital.id), queryFn: () => wishRepository.fetchUnits(employment.hospital.id) })

  const viewUnits = useMemo(() => new Set(scope.data?.viewUnitIds ?? []), [scope.data])
  const manageUnits = useMemo(() => new Set(scope.data?.manageUnitIds ?? []), [scope.data])
  const unitById = useMemo(() => new Map((units.data ?? []).map((u) => [u.id, u])), [units.data])
  const inScope = useMemo(() => (periods.data ?? []).filter((p) => viewUnits.has(p.unitId)), [periods.data, viewUnits])

  // --- filters (kept in the URL so the view is shareable) ---------------------
  const months = useMemo(() => [...new Set(inScope.map((p) => monthKey(p.periodStart)))].sort(), [inScope])
  const defaultMonth = inScope.find((p) => p.status === 'open')?.periodStart.slice(0, 7) ?? months.at(-1) ?? today.slice(0, 7)
  const month = params.get('month') ?? defaultMonth
  const view = (params.get('view') as 'matrix' | 'list' | null) ?? 'matrix'
  const unitFilter = params.get('unit') ?? ''
  const deptFilter = params.get('dept') ?? ''
  const typeFilter = (params.get('type') as WishType | null) ?? ''
  const statusFilter = (params.get('status') as WishStatus | null) ?? ''
  const dateFilter = params.get('date') ?? ''
  const [search, setSearch] = useState('')
  const setParam = (key: string, value: string) => {
    const p = new URLSearchParams(params)
    if (value) p.set(key, value)
    else p.delete(key)
    setParams(p, { replace: true })
  }

  const monthPeriods = useMemo(
    () =>
      inScope.filter(
        (p) =>
          monthKey(p.periodStart) === month &&
          (!unitFilter || p.unitId === unitFilter) &&
          (!deptFilter || unitById.get(p.unitId)?.departmentId === deptFilter),
      ),
    [inScope, month, unitFilter, deptFilter, unitById],
  )
  const periodIds = useMemo(() => monthPeriods.map((p) => p.id).sort(), [monthPeriods])
  const unitIds = useMemo(() => [...new Set(monthPeriods.map((p) => p.unitId))].sort(), [monthPeriods])
  const days = useMemo(() => monthGrid(fromISODate(`${month}-01`)).filter((d) => monthKey(d) === month), [month])
  const { overview, planned, members, directory } = useManagementData(periodIds, unitIds, days[0]!, days[days.length - 1]!)

  const [sheetPeriod, setSheetPeriod] = useState<WishPeriod | 'new' | null>(null)
  const [selected, setSelected] = useState<WishOverviewItem | null>(null)
  const [checked, setChecked] = useState<Set<string>>(new Set())

  // --- derive rows ------------------------------------------------------------
  const term = search.trim().toLowerCase()
  const wishes = useMemo(
    () =>
      (overview.data ?? []).filter(
        (w) =>
          (!typeFilter || w.type === typeFilter) &&
          (!statusFilter || w.status === statusFilter) &&
          (!dateFilter || w.date === dateFilter) &&
          (!term || `${w.firstName} ${w.lastName}`.toLowerCase().includes(term)),
      ),
    [overview.data, typeFilter, statusFilter, dateFilter, term],
  )

  const plannedByEmployee = useMemo(() => {
    const map = new Map<string, Map<ISODate, RosterEntry>>()
    for (const e of planned.data ?? []) {
      if (!e.employeeId) continue
      const inner = map.get(e.employeeId) ?? new Map()
      if (!inner.has(e.date) || e.kind === 'shift') inner.set(e.date, e)
      map.set(e.employeeId, inner)
    }
    return map
  }, [planned.data])

  const rows: MatrixRow[] = useMemo(() => {
    const people = new Map((directory.data ?? []).map((c) => [c.employeeId, c]))
    const submitted = new Set((overview.data ?? []).map((w) => w.employeeId))
    const filtering = !!(typeFilter || statusFilter || dateFilter)
    const ids = new Set<string>()
    for (const m of members.data ?? []) if (unitIds.includes(m.unitId)) ids.add(m.employeeId)
    for (const w of overview.data ?? []) ids.add(w.employeeId)
    return [...ids]
      .map((id) => {
        const p = people.get(id)
        const member = (members.data ?? []).find((m) => m.employeeId === id)
        return {
          employeeId: id,
          firstName: p?.firstName ?? '?',
          lastName: p?.lastName ?? '',
          avatarPath: p?.avatarPath ?? null,
          unitName: unitById.get(member?.unitId ?? '')?.name ?? '',
          submitted: submitted.has(id),
          wishes: new Map(wishes.filter((w) => w.employeeId === id).map((w) => [w.date, w])),
          planned: plannedByEmployee.get(id) ?? new Map(),
        }
      })
      .filter((r) => (!term || `${r.firstName} ${r.lastName}`.toLowerCase().includes(term)) && (!filtering || r.wishes.size > 0))
      .sort((a, b) => a.lastName.localeCompare(b.lastName))
  }, [directory.data, overview.data, members.data, unitIds, wishes, plannedByEmployee, unitById, term, typeFilter, statusFilter, dateFilter])

  const bulk = useMutation({
    mutationFn: (status: 'under_review' | 'considered' | 'not_considered') => wishRepository.review([...checked], status, null),
    onSuccess: (n) => {
      toast.show({ tone: 'success', title: t('wishes.manage.reviewed', { count: n }) })
      setChecked(new Set())
      void queryClient.invalidateQueries({ queryKey: ['wish-overview'] })
    },
    onError: (e) => toast.show({ tone: 'error', title: t('errors.title'), description: t(errorMessageKey(e)) }),
  })

  const departments = [...new Map((units.data ?? []).filter((u) => viewUnits.has(u.id)).map((u) => [u.departmentId, u.departmentName]))]
  const manageableUnits = (units.data ?? []).filter((u) => manageUnits.has(u.id))
  const loading = scope.isLoading || periods.isLoading || units.isLoading
  const plannedFor = (w: WishOverviewItem | null) => (w ? (plannedByEmployee.get(w.employeeId)?.get(w.date) ?? null) : null)

  return (
    <>
      <Link to="/schedule" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-text-2 hover:text-text">
        <ArrowLeft className="size-4" aria-hidden />
        {t('schedule.title')}
      </Link>
      <PageHeader
        eyebrow={t('wishes.manage.eyebrow')}
        title={t('wishes.manage.title')}
        subtitle={t('wishes.manage.subtitle')}
        actions={
          manageableUnits.length > 0 && (
            <Button icon={<Plus className="size-[18px]" />} onClick={() => setSheetPeriod('new')}>
              {t('wishes.manage.newPeriod')}
            </Button>
          )
        }
      />

      {loading && <SkeletonCard lines={6} />}
      {(periods.error || scope.error) && <QueryError error={periods.error ?? scope.error} onRetry={() => void periods.refetch()} />}

      {!loading && (
        <div className="space-y-6">
          {/* Filters */}
          <Card padding="sm" className="grid gap-3 sm:grid-cols-2 sm:p-4 lg:grid-cols-4">
            <Select aria-label={t('wishes.manage.month')} value={month} onChange={(e) => setParam('month', e.target.value)}>
              {[...new Set([...months, month])].sort().map((m) => (
                <option key={m} value={m}>
                  {fmt.monthYear(`${m}-01`)}
                </option>
              ))}
            </Select>
            <Select aria-label={t('wishes.manage.department')} value={deptFilter} onChange={(e) => setParam('dept', e.target.value)}>
              <option value="">{t('wishes.manage.allDepartments')}</option>
              {departments.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </Select>
            <Select aria-label={t('schedule.unit')} value={unitFilter} onChange={(e) => setParam('unit', e.target.value)}>
              <option value="">{t('wishes.manage.allUnits')}</option>
              {(units.data ?? [])
                .filter((u) => viewUnits.has(u.id) && (!deptFilter || u.departmentId === deptFilter))
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
            </Select>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-text-3" aria-hidden />
              <Input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('wishes.employee')} aria-label={t('wishes.employee')} className="pl-12" />
            </div>
            <Input type="date" aria-label={t('schedule.date')} value={dateFilter} min={days[0]} max={days[days.length - 1]} onChange={(e) => setParam('date', e.target.value)} />
            <Select aria-label={t('wishes.manage.type')} value={typeFilter} onChange={(e) => setParam('type', e.target.value)}>
              <option value="">{t('wishes.manage.allTypes')}</option>
              {WISH_TYPES.map((x) => (
                <option key={x} value={x}>
                  {t(`wishType.${x}`)}
                </option>
              ))}
            </Select>
            <Select aria-label={t('wishes.manage.status')} value={statusFilter} onChange={(e) => setParam('status', e.target.value)}>
              <option value="">{t('wishes.manage.allStatuses')}</option>
              {WISH_STATUSES.map((x) => (
                <option key={x} value={x}>
                  {t(`wishStatus.${x}`)}
                </option>
              ))}
            </Select>
            <SegmentedControl
              label={t('schedule.viewLabel')}
              value={view}
              onChange={(v) => setParam('view', v)}
              options={[
                { value: 'matrix', label: t('wishes.manage.matrix') },
                { value: 'list', label: t('wishes.manage.list') },
              ]}
            />
          </Card>

          {/* Periods of this month */}
          {monthPeriods.length === 0 ? (
            <Card>
              <EmptyState icon={<Settings2 />} title={t('wishes.manage.noPeriods')} description={t('wishes.manage.noPeriodsHint')} />
            </Card>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {monthPeriods.map((p) => {
                const submittedCount = new Set((overview.data ?? []).filter((w) => w.periodId === p.id).map((w) => w.employeeId)).size
                const memberCount = new Set((members.data ?? []).filter((m) => m.unitId === p.unitId).map((m) => m.employeeId)).size
                return (
                  <Card key={p.id} padding="sm" className="flex flex-wrap items-center gap-3 sm:p-5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[16px] font-semibold">{p.unitName}</p>
                      <p className="text-sm text-text-3">
                        {t('wishes.manage.deadlineShort', { date: `${fmt.dateShort(isoDateInTimeZone(p.deadlineAt, employment.hospital.timezone))}, ${fmt.time(p.deadlineAt)}` })}
                        {' · '}
                        {t('wishes.manage.submittedOf', { count: submittedCount, total: memberCount })}
                      </p>
                    </div>
                    <Badge tone={p.status === 'open' ? 'success' : p.status === 'draft' ? 'warning' : 'neutral'} dot>
                      {t(`wishPeriodStatus.${p.status}`)}
                    </Badge>
                    {manageUnits.has(p.unitId) && (
                      <Button size="sm" variant="secondary" onClick={() => setSheetPeriod(p)}>
                        {t('wishes.manage.control')}
                      </Button>
                    )}
                  </Card>
                )
              })}
            </div>
          )}

          <p className="flex items-start gap-2 px-1 text-sm text-text-3">
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
            {t('wishes.manage.legend')}
          </p>

          {overview.isLoading && <SkeletonCard lines={6} />}
          {overview.error && <QueryError error={overview.error} onRetry={() => void overview.refetch()} />}

          {monthPeriods.length > 0 && overview.data && view === 'matrix' && (
            rows.length ? <WishMatrix days={days} rows={rows} today={today} onSelect={setSelected} /> : <Card><EmptyState icon={<Search />} title={t('wishes.manage.noResults')} /></Card>
          )}

          {monthPeriods.length > 0 && overview.data && view === 'list' && (
            <Card padding="none" className="overflow-hidden">
              {checked.size > 0 && (
                <div className="flex flex-wrap items-center gap-2 border-b border-border/70 bg-primary-soft/60 px-4 py-3">
                  <span className="mr-auto text-sm font-semibold">{t('wishes.manage.selected', { count: checked.size })}</span>
                  <Button size="sm" variant="secondary" icon={<Clock3 className="size-4 text-warning" />} onClick={() => bulk.mutate('under_review')}>
                    {t('wishStatus.under_review')}
                  </Button>
                  <Button size="sm" variant="secondary" icon={<X className="size-4 text-danger" />} onClick={() => bulk.mutate('not_considered')}>
                    {t('wishStatus.not_considered')}
                  </Button>
                  <Button size="sm" icon={<Check className="size-4" />} loading={bulk.isPending} onClick={() => bulk.mutate('considered')}>
                    {t('wishStatus.considered')}
                  </Button>
                </div>
              )}
              {wishes.length === 0 ? (
                <EmptyState compact icon={<Search />} title={t('wishes.manage.noResults')} />
              ) : (
                <ul className="divide-y divide-border/70">
                  {wishes.map((w) => {
                    const plan = plannedFor(w)
                    const match = compareWithPlan(w, plan ? { kind: plan.kind, category: plan.shiftType?.category ?? null, shiftTypeId: plan.shiftType?.id ?? null } : null)
                    const reviewable = manageUnits.has(w.unitId)
                    return (
                      <li key={w.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                        {reviewable && (
                          <input
                            type="checkbox"
                            aria-label={t('wishes.manage.select')}
                            checked={checked.has(w.id)}
                            onChange={(e) =>
                              setChecked((prev) => {
                                const next = new Set(prev)
                                if (e.target.checked) next.add(w.id)
                                else next.delete(w.id)
                                return next
                              })
                            }
                            className="size-5 shrink-0 accent-[var(--primary)]"
                          />
                        )}
                        <button type="button" onClick={() => setSelected(w)} className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-1.5 text-left">
                          <span className="flex min-w-0 items-center gap-2.5 sm:w-56">
                            <PersonAvatar person={w} size="sm" />
                            <span className="min-w-0">
                              <span className="block truncate text-[15px] font-semibold">{`${w.firstName} ${w.lastName}`}</span>
                              <span className="block truncate text-xs text-text-3">{w.unitName}</span>
                            </span>
                          </span>
                          <span className="w-24 text-sm font-medium">{fmt.dateShort(w.date)}</span>
                          <WishPill type={w.type} shiftCode={w.shiftCode} short />
                          <span className="min-w-0 flex-1 truncate text-sm text-text-2">{w.note}</span>
                          <span className={cn('rounded-md border px-1.5 text-xs font-semibold', plan ? 'border-border-strong text-text-2' : 'border-transparent text-text-3', plan?.scheduleStatus === 'draft' && 'border-dashed')}>
                            {plan ? (plan.kind === 'off' ? t('dayKind.off') : (plan.shiftType?.code ?? '')) : t('wishes.manage.nothingPlannedShort')}
                          </span>
                          {match === 'mismatch' && <Badge tone="danger">{t('wishes.mismatch')}</Badge>}
                          <WishStatusBadge status={w.status} />
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </Card>
          )}
        </div>
      )}

      {sheetPeriod && (
        <PeriodSheet
          open
          onClose={() => setSheetPeriod(null)}
          period={sheetPeriod === 'new' ? null : sheetPeriod}
          units={sheetPeriod === 'new' ? manageableUnits : (units.data ?? [])}
        />
      )}
      <WishReviewSheet wish={selected} planned={plannedFor(selected)} canReview={!!selected && manageUnits.has(selected.unitId)} onClose={() => setSelected(null)} />
    </>
  )
}
