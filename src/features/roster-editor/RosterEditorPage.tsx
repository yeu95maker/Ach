import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, ArrowLeft, CalendarHeart, CalendarPlus, ChevronLeft, ChevronRight, Info, Send, UserSearch } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useSearchParams } from 'react-router'
import { dayKindStyles } from '@/components/dayKindStyles'
import { PersonAvatar } from '@/components/PersonAvatar'
import { QueryError } from '@/components/QueryState'
import { toAppError } from '@/core/errors'
import { rosterEditorRepository, type EditorShiftType } from '@/data/rosterEditorRepository'
import { scheduleRepository } from '@/data/scheduleRepository'
import { teamRepository } from '@/data/teamRepository'
import { wishRepository } from '@/data/wishRepository'
import { fromISODate, isoDateInTimeZone, isWithin, monthGrid } from '@/domain/dates'
import { can } from '@/domain/permissions'
import { cellChange, cellIssues, dailyCounts, requiredOn, restViolations, type Brush, type PlanningIssue } from '@/domain/rosterPlanning'
import { durationMinutes } from '@/domain/schedule'
import type { CoverShift } from '@/domain/staffing'
import type { ISODate, RosterEntry } from '@/domain/types'
import type { Wish } from '@/domain/wishes'
import { queryKeys } from '@/features/queryKeys'
import { CandidatesSheet } from '@/features/staffing/CandidatesSheet'
import { useEmployment } from '@/features/tenant/TenantProvider'
import { useHospitalFormatter } from '@/features/tenant/useHospitalFormatter'
import { useWishPeriods } from '@/features/wishes/useWishes'
import { WishPill } from '@/features/wishes/wishStyles'
import { Badge, Button, ButtonLink, Card, EmptyState, IconButton, PageHeader, Select, Sheet, SkeletonCard, cn, useToast } from '@/ui'
import { EditorPalette } from './EditorPalette'
import { RosterGrid, type GridRow } from './RosterGrid'

const shiftMonth = (month: string, delta: number) => {
  const d = fromISODate(`${month}-01`)
  const n = new Date(d.getFullYear(), d.getMonth() + delta, 1)
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`
}

export function RosterEditorPage() {
  const { t } = useTranslation()
  const employment = useEmployment()
  const fmt = useHospitalFormatter()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [params, setParams] = useSearchParams()
  const today = isoDateInTimeZone(new Date(), employment.hospital.timezone)

  const units = useQuery({ queryKey: queryKeys.wishUnits(employment.hospital.id), queryFn: () => wishRepository.fetchUnits(employment.hospital.id) })
  const managed = (units.data ?? []).filter((u) => employment.managedUnitIds.includes(u.id))
  const unitId = params.get('unit') ?? managed[0]?.id ?? ''
  const month = params.get('month') ?? shiftMonth(today.slice(0, 7), 1)
  const days = useMemo(() => monthGrid(fromISODate(`${month}-01`)).filter((d) => d.startsWith(month)), [month])
  const from = days[0]!
  const to = days[days.length - 1]!
  const setParam = (k: string, v: string) => {
    const p = new URLSearchParams(params)
    p.set(k, v)
    setParams(p, { replace: true })
  }

  // --- data -------------------------------------------------------------------
  const schedule = useQuery({
    queryKey: queryKeys.editorSchedule(unitId, month),
    queryFn: () => rosterEditorRepository.fetchSchedule(unitId, from, to),
    enabled: !!unitId,
  })
  const scheduleId = schedule.data?.id ?? null
  const entries = useQuery({
    queryKey: queryKeys.editorEntries(scheduleId ?? ''),
    queryFn: () => rosterEditorRepository.fetchEntries(scheduleId!),
    enabled: !!scheduleId,
  })
  const shiftTypes = useQuery({
    queryKey: queryKeys.editorShiftTypes(unitId),
    queryFn: () => rosterEditorRepository.fetchShiftTypes(employment.hospital.id, unitId),
    enabled: !!unitId,
    staleTime: 30 * 60_000,
  })
  const staffing = useQuery({
    queryKey: queryKeys.editorStaffing(unitId),
    queryFn: () => rosterEditorRepository.fetchStaffing(unitId, shiftTypes.data ?? []),
    enabled: !!unitId && !!shiftTypes.data,
  })
  const members = useQuery({
    queryKey: queryKeys.unitMembers([unitId]),
    queryFn: () => wishRepository.fetchUnitMembers([unitId]),
    enabled: !!unitId,
  })
  const directory = useQuery({ queryKey: queryKeys.directory(employment.hospital.id), queryFn: () => teamRepository.fetchDirectory(employment.hospital.id) })
  const memberIds = useMemo(() => [...new Set((members.data ?? []).map((m) => m.employeeId))].sort(), [members.data])
  const absences = useQuery({
    queryKey: queryKeys.editorAbsences(unitId, month),
    queryFn: () => rosterEditorRepository.fetchAbsences(memberIds, from, to),
    enabled: memberIds.length > 0,
  })
  const wishPeriods = useWishPeriods()
  const wishPeriodIds = (wishPeriods.data ?? []).filter((p) => p.unitId === unitId && p.periodStart <= to && p.periodEnd >= from).map((p) => p.id)
  const wishes = useQuery({
    queryKey: queryKeys.wishOverview(wishPeriodIds),
    queryFn: () => wishRepository.fetchOverview(wishPeriodIds),
    enabled: wishPeriodIds.length > 0 && can(employment, 'wishes.view'),
  })

  // --- derived ------------------------------------------------------------------
  const all = useMemo(() => entries.data ?? [], [entries.data])
  const rest = useMemo(() => restViolations(all), [all])
  const counts = useMemo(() => dailyCounts(all, days), [all, days])
  const reqs = staffing.data ?? []

  const rows: GridRow[] = useMemo(() => {
    const people = new Map((directory.data ?? []).map((c) => [c.employeeId, c]))
    const ids = new Set([...memberIds, ...all.filter((e) => e.employeeId).map((e) => e.employeeId!)])
    return [...ids]
      .map((id) => {
        const p = people.get(id)
        const mine = all.filter((e) => e.employeeId === id)
        const byDate = new Map<ISODate, RosterEntry>()
        for (const e of mine) if (!byDate.has(e.date) || e.kind === 'shift') byDate.set(e.date, e)
        const wishMap = new Map<ISODate, Wish>((wishes.data ?? []).filter((w) => w.employeeId === id).map((w) => [w.date, w]))
        const abs = absences.data?.get(id) ?? []
        const issues = new Map<ISODate, PlanningIssue[]>()
        for (const d of days) {
          const entry = byDate.get(d) ?? null
          const list = cellIssues({ entry, wish: wishMap.get(d) ?? null, absences: abs, date: d, restViolation: !!entry && rest.has(entry.id) })
          if (list.length) issues.set(d, list)
        }
        return {
          employeeId: id,
          firstName: p?.firstName ?? '?',
          lastName: p?.lastName ?? '',
          avatarPath: p?.avatarPath ?? null,
          jobTitle: p?.jobTitle ?? '',
          entries: byDate,
          wishes: wishMap,
          absences: abs,
          issues,
          plannedMinutes: mine.reduce((sum, e) => sum + durationMinutes(e), 0),
        }
      })
      .sort((a, b) => a.lastName.localeCompare(b.lastName))
  }, [directory.data, memberIds, all, wishes.data, absences.data, days, rest])

  const openShifts = useMemo(() => {
    const map = new Map<ISODate, RosterEntry[]>()
    for (const e of all) if (!e.employeeId && e.kind === 'shift') map.set(e.date, [...(map.get(e.date) ?? []), e])
    return map
  }, [all])

  const issueList = rows.flatMap((r) => [...r.issues].flatMap(([date, list]) => list.map((issue) => ({ row: r, date, issue })))).sort((a, b) => a.date.localeCompare(b.date))

  // --- editing ------------------------------------------------------------------
  const [brush, setBrush] = useState<Brush>({ kind: 'inspect' })
  const [inspect, setInspect] = useState<{ row: GridRow; date: ISODate } | null>(null)
  const [cover, setCover] = useState<CoverShift | null>(null)
  const [pending, setPending] = useState<Set<string>>(new Set())
  const [confirmPublish, setConfirmPublish] = useState(false)
  const [showAllIssues, setShowAllIssues] = useState(false)

  const refreshEntries = () => queryClient.invalidateQueries({ queryKey: queryKeys.editorEntries(scheduleId ?? '') })
  const failToast = (e: unknown) =>
    toast.show({ tone: 'error', title: toAppError(e).kind === 'conflict' ? t('editor.overlap') : t('errors.title'), description: toAppError(e).kind === 'conflict' ? t('editor.overlapHint') : t(`errors.${toAppError(e).kind}`) })

  const setCell = useMutation({
    mutationFn: (v: { employeeId: string; date: ISODate; kind: 'shift' | 'off' | null; shiftTypeId: string | null }) =>
      rosterEditorRepository.setCell(scheduleId!, v.employeeId, v.date, v.kind, v.shiftTypeId),
    onMutate: (v) => setPending((p) => new Set(p).add(`${v.employeeId}|${v.date}`)),
    onError: failToast,
    onSettled: async (_d, _e, v) => {
      await refreshEntries()
      setPending((p) => {
        const n = new Set(p)
        n.delete(`${v.employeeId}|${v.date}`)
        return n
      })
    },
  })

  const openShift = useMutation({
    mutationFn: (v: { date: ISODate; shiftTypeId: string } | { deleteId: string }) =>
      'deleteId' in v ? rosterEditorRepository.deleteEntry(v.deleteId) : rosterEditorRepository.addOpenShift(employment.hospital.id, scheduleId!, v.date, v.shiftTypeId),
    onError: failToast,
    onSettled: () => void refreshEntries(),
  })

  const create = useMutation({
    mutationFn: () => rosterEditorRepository.createSchedule(employment.hospital.id, unitId, from, to),
    onSuccess: () => {
      toast.show({ tone: 'success', title: t('editor.created') })
      void queryClient.invalidateQueries({ queryKey: queryKeys.editorSchedule(unitId, month) })
    },
    onError: (e) => toast.show({ tone: 'error', title: t('errors.title'), description: toAppError(e).kind === 'conflict' ? t('editor.createConflict') : t(`errors.${toAppError(e).kind}`) }),
  })

  const publish = useMutation({
    mutationFn: () => scheduleRepository.publishSchedule(scheduleId!),
    onSuccess: () => {
      setConfirmPublish(false)
      toast.show({ tone: 'success', title: t('schedule.published'), description: t('schedule.publishedHint') })
      void queryClient.invalidateQueries({ queryKey: queryKeys.editorSchedule(unitId, month) })
      void queryClient.invalidateQueries({ queryKey: ['managed-schedules'] })
      void queryClient.invalidateQueries({ queryKey: ['roster'] })
    },
    onError: failToast,
  })

  const apply = (row: GridRow, date: ISODate, b: Brush) => {
    const change = cellChange(row.entries.get(date) ?? null, b)
    if (!change) return
    setCell.mutate({ employeeId: row.employeeId, date, kind: change.kind, shiftTypeId: change.kind === 'shift' ? change.shiftTypeId : null })
  }

  const onCell = (row: GridRow, date: ISODate) => {
    if (brush.kind === 'inspect') return setInspect({ row, date })
    apply(row, date, brush)
  }

  const onOpenCell = (date: ISODate) => {
    if (brush.kind === 'shift') openShift.mutate({ date, shiftTypeId: brush.shiftTypeId })
    else toast.show({ tone: 'info', title: t('editor.pickShiftFirst') })
  }
  const onOpenShift = (e: RosterEntry) => {
    if (brush.kind === 'erase') openShift.mutate({ deleteId: e.id })
    else toast.show({ tone: 'info', title: t('editor.eraseOpenShiftHint') })
  }

  const loading = units.isLoading || schedule.isLoading || (scheduleId && entries.isLoading) || shiftTypes.isLoading
  const types: EditorShiftType[] = shiftTypes.data ?? []

  // keep the inspected row fresh after edits
  const inspectRow = inspect ? (rows.find((r) => r.employeeId === inspect.row.employeeId) ?? inspect.row) : null

  return (
    <>
      <Link to="/schedule" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-text-2 hover:text-text">
        <ArrowLeft className="size-4" aria-hidden />
        {t('schedule.title')}
      </Link>
      <PageHeader
        eyebrow={t('wishes.manage.eyebrow')}
        title={t('editor.title')}
        subtitle={t('editor.subtitle')}
        actions={
          can(employment, 'wishes.view') && (
            <ButtonLink to={`/schedule/wishes/manage?month=${month}&unit=${unitId}`} variant="secondary" icon={<CalendarHeart className="size-[18px]" />}>
              {t('wishes.manage.title')}
            </ButtonLink>
          )
        }
      />

      {managed.length === 0 && !units.isLoading ? (
        <Card>
          <EmptyState icon={<Info />} title={t('editor.noUnits')} />
        </Card>
      ) : (
        <div className="space-y-5">
          {/* Toolbar */}
          <Card padding="sm" className="flex flex-wrap items-center gap-3 sm:p-4">
            <Select aria-label={t('schedule.unit')} value={unitId} onChange={(e) => setParam('unit', e.target.value)} className="w-full sm:w-64">
              {managed.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </Select>
            <div className="flex items-center gap-1">
              <IconButton label={t('common.previous')} variant="secondary" onClick={() => setParam('month', shiftMonth(month, -1))}>
                <ChevronLeft className="size-5" />
              </IconButton>
              <span className="min-w-36 text-center text-[16px] font-semibold capitalize">{fmt.monthYear(`${month}-01`)}</span>
              <IconButton label={t('common.next')} variant="secondary" onClick={() => setParam('month', shiftMonth(month, 1))}>
                <ChevronRight className="size-5" />
              </IconButton>
            </div>
            {schedule.data && (
              <>
                <Badge tone={schedule.data.status === 'published' ? 'success' : 'warning'} dot>
                  {schedule.data.status === 'published' ? t('schedule.statusPublished', { version: schedule.data.version }) : t('schedule.statusDraft')}
                </Badge>
                {can(employment, 'schedule.publish') && (
                  <Button className="sm:ml-auto" icon={<Send className="size-4" />} onClick={() => setConfirmPublish(true)}>
                    {schedule.data.status === 'published' ? t('schedule.republish') : t('schedule.publish')}
                  </Button>
                )}
              </>
            )}
          </Card>

          {loading && <SkeletonCard lines={8} />}
          {(schedule.error || entries.error) && <QueryError error={schedule.error ?? entries.error} onRetry={() => void schedule.refetch()} />}

          {!loading && !schedule.data && unitId && (
            <Card>
              <EmptyState
                icon={<CalendarPlus />}
                title={t('editor.noSchedule', { month: fmt.monthYear(`${month}-01`) })}
                description={t('editor.noScheduleHint')}
                action={
                  <Button loading={create.isPending} icon={<CalendarPlus className="size-4" />} onClick={() => create.mutate()}>
                    {t('editor.create')}
                  </Button>
                }
              />
            </Card>
          )}

          {!loading && schedule.data && (
            <>
              <p className="flex items-start gap-2 px-1 text-sm text-text-3">
                <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
                {schedule.data.status === 'published' ? t('editor.publishedHint') : t('editor.howTo')}
              </p>

              <RosterGrid
                days={days}
                rows={rows}
                openShifts={openShifts}
                counts={counts}
                required={(d) => requiredOn(reqs, d)}
                today={today}
                pending={pending}
                onCell={onCell}
                onOpenCell={onOpenCell}
                onOpenShift={onOpenShift}
              />

              {issueList.length > 0 && (
                <Card>
                  <h2 className="mb-3 flex items-center gap-2 text-[17px] font-semibold">
                    <AlertTriangle className="size-5 text-warning" aria-hidden />
                    {t('editor.issues', { count: issueList.length })}
                  </h2>
                  <ul className="divide-y divide-border/70">
                    {(showAllIssues ? issueList : issueList.slice(0, 8)).map((i) => (
                      <li key={`${i.row.employeeId}-${i.date}-${i.issue}`}>
                        <button type="button" onClick={() => setInspect({ row: i.row, date: i.date })} className="flex w-full items-center gap-3 py-2.5 text-left hover:bg-surface-2/50">
                          <span className="w-24 shrink-0 text-sm font-medium">{fmt.dateShort(i.date)}</span>
                          <span className="min-w-0 flex-1 truncate text-sm">{`${i.row.firstName} ${i.row.lastName}`}</span>
                          <Badge tone={i.issue === 'wish_conflict' ? 'warning' : 'danger'}>{t(`editor.issue.${i.issue}`)}</Badge>
                        </button>
                      </li>
                    ))}
                  </ul>
                  {issueList.length > 8 && (
                    <Button variant="ghost" size="sm" className="mt-2" onClick={() => setShowAllIssues((v) => !v)}>
                      {showAllIssues ? t('editor.showLess') : t('editor.showAll', { count: issueList.length })}
                    </Button>
                  )}
                </Card>
              )}

              {/* Sticky tool bar */}
              <div className="sticky bottom-[calc(5.75rem+env(safe-area-inset-bottom))] z-30 md:bottom-4">
                <div className="rounded-[24px] border border-border/70 bg-surface/90 p-3 shadow-lg backdrop-blur-xl">
                  <EditorPalette brush={brush} onBrush={setBrush} shiftTypes={types} />
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Cell details & quick edit (works on every device) */}
      <Sheet
        open={!!inspect}
        onClose={() => setInspect(null)}
        closeLabel={t('common.close')}
        title={inspect ? fmt.dateLong(inspect.date) : ''}
      >
        {inspect && inspectRow && (
          <CellDetails
            row={inspectRow}
            date={inspect.date}
            shiftTypes={types}
            busy={setCell.isPending}
            onSet={(b) => apply(inspectRow, inspect.date, b)}
            onFindCover={(e) => {
              setInspect(null)
              setCover(toCoverShift(e))
            }}
          />
        )}
      </Sheet>

      <CandidatesSheet shift={cover} onClose={() => setCover(null)} allowRelease />

      <Sheet
        open={confirmPublish}
        onClose={() => setConfirmPublish(false)}
        closeLabel={t('common.close')}
        title={t('schedule.publishConfirmTitle')}
        description={schedule.data ? `${schedule.data.unitName} · ${fmt.monthYear(`${month}-01`)}` : undefined}
        footer={
          <div className="grid gap-3 sm:grid-cols-2">
            <Button variant="secondary" size="lg" onClick={() => setConfirmPublish(false)}>
              {t('common.cancel')}
            </Button>
            <Button size="lg" loading={publish.isPending} onClick={() => publish.mutate()}>
              {t('schedule.publishNow')}
            </Button>
          </div>
        }
      >
        <p className="text-[15px] text-text-2">{t('schedule.publishConfirmText')}</p>
        {issueList.length > 0 && (
          <p className="mt-4 flex items-start gap-2 rounded-2xl bg-warning-soft px-4 py-3 text-[15px] text-warning-text">
            <AlertTriangle className="mt-0.5 size-5 shrink-0" aria-hidden />
            {t('editor.publishWithIssues', { count: issueList.length })}
          </p>
        )}
      </Sheet>
    </>
  )
}

function toCoverShift(e: RosterEntry): CoverShift {
  return {
    entryId: e.id,
    scheduleId: e.scheduleId,
    unitId: e.unitId,
    unitName: e.unitName,
    date: e.date,
    startsAt: e.startsAt!,
    endsAt: e.endsAt!,
    shiftCode: e.shiftType?.code ?? null,
    shiftName: e.shiftType?.name ?? null,
    category: e.shiftType?.category ?? null,
  }
}

function CellDetails({
  row,
  date,
  shiftTypes,
  busy,
  onSet,
  onFindCover,
}: {
  row: GridRow
  date: ISODate
  shiftTypes: EditorShiftType[]
  busy: boolean
  onSet: (b: Brush) => void
  onFindCover: (entry: RosterEntry) => void
}) {
  const { t } = useTranslation()
  const fmt = useHospitalFormatter()
  const entry = row.entries.get(date) ?? null
  const wish = row.wishes.get(date)
  const absence = row.absences.find((a) => isWithin(date, a.startDate, a.endDate))
  const issues = row.issues.get(date) ?? []
  const shiftTypeCode = (id: string | null) => shiftTypes.find((s) => s.id === id)?.code ?? null

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <PersonAvatar person={row} />
        <div>
          <p className="text-[16px] font-semibold">{`${row.firstName} ${row.lastName}`}</p>
          <p className="text-sm text-text-3">{row.jobTitle}</p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-border/70 p-4">
          <p className="mb-2 text-xs font-semibold text-text-3 uppercase">{t('wishes.manage.planned')}</p>
          <p className="text-[15px] font-semibold">
            {entry ? (entry.kind === 'off' ? t('dayKind.off') : `${entry.shiftType?.code} · ${entry.shiftType?.name}`) : t('editor.empty')}
          </p>
          {entry?.startsAt && entry.endsAt && <p className="text-sm text-text-2 tabular">{fmt.timeRange(entry.startsAt, entry.endsAt)}</p>}
        </div>
        <div className="rounded-2xl border border-dashed border-border-strong p-4">
          <p className="mb-2 text-xs font-semibold text-text-3 uppercase">{t('wishes.manage.wish')}</p>
          {wish ? <WishPill type={wish.type} shiftCode={shiftTypeCode(wish.shiftTypeId)} /> : <p className="text-sm text-text-3">{t('wishes.noWish')}</p>}
          {wish?.note && <p className="mt-2 text-sm text-text-2">{wish.note}</p>}
        </div>
      </div>

      {absence && (
        <p className={cn('rounded-2xl px-4 py-3 text-[15px] font-medium', dayKindStyles[absence.kind].soft, dayKindStyles[absence.kind].text)}>
          {t(`dayKind.${absence.kind}`)} · {fmt.dateRange(absence.startDate, absence.endDate)}
        </p>
      )}
      {issues.length > 0 && (
        <ul className="space-y-2">
          {issues.map((i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-warning-text">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
              {t(`editor.issueLong.${i}`)}
            </li>
          ))}
        </ul>
      )}

      {entry?.kind === 'shift' && entry.startsAt && entry.endsAt && entry.endsAt > new Date() && (
        <Button variant="soft" fullWidth icon={<UserSearch className="size-[18px]" />} onClick={() => onFindCover(entry)}>
          {t('staffing.whoCanCover')}
        </Button>
      )}

      <div>
        <p className="mb-2 text-xs font-semibold text-text-3 uppercase">{t('editor.setTo')}</p>
        <div className="flex flex-wrap gap-2">
          {shiftTypes.map((st) => {
            const s = dayKindStyles[st.category]
            const active = entry?.kind === 'shift' && entry.shiftType?.id === st.id
            return (
              <button key={st.id} type="button" disabled={busy} onClick={() => onSet({ kind: 'shift', shiftTypeId: st.id })}
                className={cn('h-11 rounded-full px-4 text-[14px] font-semibold disabled:opacity-50', active ? cn(s.solid, 'text-white') : cn(s.soft, s.text))}>
                {st.code} · {st.name}
              </button>
            )
          })}
          <button type="button" disabled={busy} onClick={() => onSet({ kind: 'off' })}
            className={cn('h-11 rounded-full px-4 text-[14px] font-semibold disabled:opacity-50', entry?.kind === 'off' ? 'bg-off text-white' : 'bg-off-soft text-off-text')}>
            {t('dayKind.off')}
          </button>
          {entry && (
            <button type="button" disabled={busy} onClick={() => onSet({ kind: 'erase' })} className="h-11 rounded-full bg-danger-soft px-4 text-[14px] font-semibold text-danger-text disabled:opacity-50">
              {t('wishes.erase')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
