import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { BellOff, BellRing, CheckCheck } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { QueryError } from '@/components/QueryState'
import { notificationRepository } from '@/data/notificationRepository'
import { isoDateInTimeZone } from '@/domain/dates'
import { notificationMeta } from '@/domain/notifications'
import type { AppNotification } from '@/domain/types'
import { queryKeys } from '@/features/queryKeys'
import { useCurrentUser, useEmployment } from '@/features/tenant/TenantProvider'
import { useHospitalFormatter } from '@/features/tenant/useHospitalFormatter'
import { Button, Card, EmptyState, ListGroup, PageHeader, SectionTitle, SkeletonCard, cn, useToast } from '@/ui'
import { NotificationIcon } from './NotificationIcon'
import { currentPushState, enablePush, type PushState } from './push'
import { useNotificationText } from './useNotificationText'

export function NotificationsPage() {
  const { t } = useTranslation()
  const user = useCurrentUser()
  const employment = useEmployment()
  const fmt = useHospitalFormatter()
  const render = useNotificationText()
  const navigate = useNavigate()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [pushState, setPushState] = useState<PushState>(currentPushState)

  const query = useInfiniteQuery({
    queryKey: queryKeys.notifications(user.id),
    queryFn: ({ pageParam }) => notificationRepository.fetchPage(pageParam),
    initialPageParam: undefined as Date | undefined,
    getNextPageParam: (last) => (last.length === notificationRepository.pageSize ? last[last.length - 1]!.createdAt : undefined),
  })

  const items = useMemo(() => query.data?.pages.flat() ?? [], [query.data])
  const unread = items.filter((n) => !n.readAt).length

  const markRead = useMutation({
    mutationFn: (ids: string[] | null) => notificationRepository.markRead(ids),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.notifications(user.id) })
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard(employment.employeeId) })
    },
  })

  const open = (n: AppNotification) => {
    if (!n.readAt) markRead.mutate([n.id])
    navigate(notificationMeta(n).route)
  }

  const groups = useMemo(() => {
    const today = isoDateInTimeZone(new Date(), employment.hospital.timezone)
    const todayItems = items.filter((n) => isoDateInTimeZone(n.createdAt, employment.hospital.timezone) === today)
    const earlier = items.filter((n) => !todayItems.includes(n))
    return [
      { key: 'today', label: t('common.today'), items: todayItems },
      { key: 'earlier', label: t('notifications.earlier'), items: earlier },
    ].filter((g) => g.items.length)
  }, [items, employment.hospital.timezone, t])

  const activatePush = async () => {
    const state = await enablePush().catch(() => 'default' as PushState)
    setPushState(state)
    if (state === 'granted') toast.show({ tone: 'success', title: t('notifications.pushEnabled') })
    if (state === 'denied') toast.show({ tone: 'warning', title: t('notifications.pushDenied') })
  }

  return (
    <>
      <PageHeader
        title={t('notifications.title')}
        subtitle={unread ? t('dashboard.unreadCount', { count: unread }) : t('notifications.allRead')}
        actions={
          unread > 0 && (
            <Button variant="secondary" size="sm" icon={<CheckCheck className="size-4" />} loading={markRead.isPending && markRead.variables === null} onClick={() => markRead.mutate(null)}>
              {t('notifications.markAllRead')}
            </Button>
          )
        }
      />

      <div className="mx-auto max-w-3xl space-y-8">
        {pushState === 'default' && (
          <Card className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-accent-soft text-accent-text">
              <BellRing className="size-6" />
            </span>
            <div className="flex-1">
              <p className="text-[16px] font-semibold">{t('notifications.pushTitle')}</p>
              <p className="text-sm text-text-2">{t('notifications.pushText')}</p>
            </div>
            <Button variant="accent" onClick={activatePush}>
              {t('notifications.pushEnable')}
            </Button>
          </Card>
        )}

        {query.isLoading && <SkeletonCard lines={4} />}
        {query.error && <QueryError error={query.error} onRetry={() => void query.refetch()} />}
        {query.data && items.length === 0 && (
          <Card>
            <EmptyState icon={<BellOff />} title={t('notifications.empty')} description={t('notifications.emptyHint')} />
          </Card>
        )}

        {groups.map((g) => (
          <section key={g.key}>
            <SectionTitle>{g.label}</SectionTitle>
            <ListGroup>
              {g.items.map((n) => {
                const text = render(n)
                return (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => open(n)}
                    className="flex w-full items-start gap-3.5 px-4 py-4 text-left transition-colors hover:bg-surface-2/60 active:bg-surface-2 sm:px-5"
                  >
                    <NotificationIcon notification={n} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-3">
                        <span className={cn('truncate text-[15px]', n.readAt ? 'font-medium text-text-2' : 'font-semibold text-text')}>{text.title}</span>
                        <span className="shrink-0 text-xs text-text-3">{fmt.relative(n.createdAt)}</span>
                      </span>
                      <span className="mt-0.5 line-clamp-2 block text-sm text-text-3">{text.body}</span>
                    </span>
                    {!n.readAt && <span className="mt-2 size-2.5 shrink-0 rounded-full bg-accent" aria-label={t('notifications.unread')} />}
                  </button>
                )
              })}
            </ListGroup>
          </section>
        ))}

        {query.hasNextPage && (
          <div className="flex justify-center">
            <Button variant="secondary" loading={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>
              {t('common.loadMore')}
            </Button>
          </div>
        )}
      </div>
    </>
  )
}
