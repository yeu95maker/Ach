import { ArrowRight, Bell, ClipboardCheck, HeartPulse, Palmtree, Sparkles } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { dayKindStyles } from '@/components/dayKindStyles'
import { QueryError, Stagger } from '@/components/QueryState'
import { RequestStatusBadge } from '@/components/RequestStatusBadge'
import { can } from '@/domain/permissions'
import { notificationMeta } from '@/domain/notifications'
import { NotificationIcon } from '@/features/notifications/NotificationIcon'
import { useNotificationText } from '@/features/notifications/useNotificationText'
import { useCurrentUser, useEmployment } from '@/features/tenant/TenantProvider'
import { NewsPreview } from '@/features/news/NewsPreview'
import { WishPlanPromo } from '@/features/wishes/WishPlanPromo'
import { useHospitalFormatter } from '@/features/tenant/useHospitalFormatter'
import { Card, CardHeader, EmptyState, PageHeader, SkeletonCard, cn } from '@/ui'
import { QuickActions } from './QuickActions'
import { NextShiftCard, TodayCard } from './TodayCard'
import { useDashboard } from './useDashboard'
import { WardStatusCard } from './WardStatusCard'

function greetingKey(now: Date) {
  const h = now.getHours()
  if (h < 5) return 'dashboard.greetingNight'
  if (h < 11) return 'dashboard.greetingMorning'
  if (h < 18) return 'dashboard.greetingDay'
  return 'dashboard.greetingEvening'
}

function SeeAll({ to }: { to: string }) {
  const { t } = useTranslation()
  return (
    <Link to={to} className="inline-flex items-center gap-1 text-sm font-semibold text-primary-text hover:underline">
      {t('common.seeAll')}
      <ArrowRight className="size-4" aria-hidden />
    </Link>
  )
}

export function DashboardPage() {
  const { t } = useTranslation()
  const user = useCurrentUser()
  const employment = useEmployment()
  const fmt = useHospitalFormatter()
  const render = useNotificationText()
  const { data, isLoading, error, refetch } = useDashboard()
  const isApprover = can(employment, 'leave.approve')
  const seesSick = can(employment, 'sick_leave.view')

  return (
    <>
      <PageHeader
        eyebrow={data ? fmt.dateLong(data.today) : ' '}
        title={t(greetingKey(new Date()), { name: user.firstName })}
        subtitle={employment.units.find((u) => u.isPrimary)?.name ?? employment.hospital.name}
      />

      {isLoading && (
        <div className="grid gap-4 lg:grid-cols-3">
          <SkeletonCard className="lg:col-span-2" lines={4} />
          <SkeletonCard lines={3} />
        </div>
      )}
      {error && <QueryError error={error} onRetry={() => void refetch()} />}

      {data && (
        <div className="grid gap-4 sm:gap-5 lg:grid-cols-3">
          <div className="min-w-0 space-y-4 sm:space-y-5 lg:col-span-2">
            <Stagger index={0}>
              <TodayCard data={data} />
            </Stagger>
            <Stagger index={1}>
              <NextShiftCard entry={data.nextShift} />
            </Stagger>
            <Stagger index={2}>
              <WardStatusCard />
            </Stagger>
            <WishPlanPromo />
            <Stagger index={2}>
              <QuickActions />
            </Stagger>

            {(isApprover || seesSick) && (data.pendingApprovals > 0 || data.unacknowledgedSickLeaves > 0) && (
              <Stagger index={3}>
                <Card className="border-primary/15 bg-gradient-to-br from-primary-soft/70 to-surface">
                  <CardHeader
                    title={t('dashboard.managerTitle')}
                    subtitle={t('dashboard.managerSubtitle')}
                    icon={
                      <span className="flex size-10 items-center justify-center rounded-xl bg-primary text-on-primary">
                        <ClipboardCheck className="size-5" />
                      </span>
                    }
                  />
                  <div className="grid gap-3 sm:grid-cols-2">
                    {isApprover && (
                      <Link to="/team?tab=requests" className="flex items-center justify-between rounded-2xl bg-surface p-4 shadow-sm transition-transform hover:-translate-y-0.5">
                        <span className="flex items-center gap-3">
                          <Palmtree className="size-5 text-accent" aria-hidden />
                          <span className="font-medium">{t('dashboard.pendingApprovals')}</span>
                        </span>
                        <span className="text-2xl font-bold tabular">{data.pendingApprovals}</span>
                      </Link>
                    )}
                    {seesSick && (
                      <Link to="/team?tab=sick" className="flex items-center justify-between rounded-2xl bg-surface p-4 shadow-sm transition-transform hover:-translate-y-0.5">
                        <span className="flex items-center gap-3">
                          <HeartPulse className="size-5 text-text-3" aria-hidden />
                          <span className="font-medium">{t('dashboard.newSickReports')}</span>
                        </span>
                        <span className="text-2xl font-bold tabular">{data.unacknowledgedSickLeaves}</span>
                      </Link>
                    )}
                  </div>
                </Card>
              </Stagger>
            )}

            <Stagger index={4}>
              <Card padding="none">
                <div className="p-5 pb-1 sm:p-6 sm:pb-2">
                  <CardHeader
                    title={t('dashboard.notifications')}
                    action={<SeeAll to="/notifications" />}
                    subtitle={data.unreadNotifications ? t('dashboard.unreadCount', { count: data.unreadNotifications }) : undefined}
                  />
                </div>
                {data.recentNotifications.length === 0 ? (
                  <EmptyState compact icon={<Bell />} title={t('notifications.empty')} />
                ) : (
                  <ul className="divide-y divide-border/70">
                    {data.recentNotifications.map((n) => {
                      const text = render(n)
                      return (
                        <li key={n.id}>
                          <Link to={notificationMeta(n).route} className="flex items-start gap-3.5 px-5 py-4 transition-colors hover:bg-surface-2/60 sm:px-6">
                            <NotificationIcon notification={n} />
                            <span className="min-w-0 flex-1">
                              <span className={cn('block truncate text-[15px]', n.readAt ? 'font-medium' : 'font-semibold')}>{text.title}</span>
                              <span className="block truncate text-sm text-text-3">{text.body}</span>
                            </span>
                            <span className="shrink-0 text-xs text-text-3">{fmt.relative(n.createdAt)}</span>
                          </Link>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </Card>
            </Stagger>
          </div>

          <div className="min-w-0 space-y-4 sm:space-y-5">
            <Stagger index={1}>
              <NewsPreview />
            </Stagger>
            <Stagger index={2}>
              <Card>
                <CardHeader title={t('dashboard.myRequests')} action={<SeeAll to="/requests" />} />
                {data.myOpenRequests.length === 0 ? (
                  <EmptyState compact icon={<Palmtree />} title={t('dashboard.noOpenRequests')} />
                ) : (
                  <ul className="space-y-3">
                    {data.myOpenRequests.map((r) => (
                      <li key={r.id} className="flex items-center justify-between gap-3 rounded-2xl bg-surface-2/70 px-4 py-3">
                        <span className="min-w-0">
                          <span className="block truncate text-[15px] font-medium">{t(`leaveType.${r.leaveType}`)}</span>
                          <span className="block truncate text-sm text-text-3">{fmt.dateRange(r.startDate, r.endDate)}</span>
                        </span>
                        <RequestStatusBadge status={r.status} />
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </Stagger>

            <Stagger index={3}>
              <Card>
                <CardHeader title={t('dashboard.openShifts')} subtitle={t('dashboard.openShiftsSubtitle')} action={data.openShifts.length > 0 ? <SeeAll to="/schedule/open" /> : undefined} />
                {data.openShifts.length === 0 ? (
                  <EmptyState compact icon={<Sparkles />} title={t('dashboard.noOpenShifts')} />
                ) : (
                  <ul className="space-y-3">
                    {data.openShifts.map((s) => {
                      const style = dayKindStyles[s.category ?? 'other']
                      return (
                        <li key={s.id}>
                          <Link to="/schedule/open" className="flex items-center gap-3 rounded-2xl border border-dashed border-border-strong px-4 py-3 transition-colors hover:bg-surface-2/60">
                            <span className={cn('h-10 w-1.5 shrink-0 rounded-full', style.solid)} aria-hidden />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[15px] font-medium">
                                {s.shiftName ?? t(`dayKind.${s.category ?? 'other'}`)} · {fmt.dateShort(s.date)}
                              </span>
                              <span className="block truncate text-sm text-text-3 tabular">
                                {fmt.timeRange(s.startsAt, s.endsAt)} · {s.unitName}
                              </span>
                            </span>
                          </Link>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </Card>
            </Stagger>

          </div>
        </div>
      )}
    </>
  )
}
