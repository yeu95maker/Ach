import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { MessagesSquare } from 'lucide-react'
import { Link, useSearchParams } from 'react-router'
import { teamRepository } from '@/data/teamRepository'
import { can } from '@/domain/permissions'
import { queryKeys } from '@/features/queryKeys'
import { useChats } from '@/features/chat/useChat'
import { useEmployment } from '@/features/tenant/TenantProvider'
import { CountBadge, PageHeader, cn } from '@/ui'
import { ColleaguesTab } from './ColleaguesTab'
import { LeaveApprovalsTab } from './LeaveApprovalsTab'
import { OnDutyTab } from './OnDutyTab'
import { SickLeavesTab } from './SickLeavesTab'

type Tab = 'duty' | 'colleagues' | 'requests' | 'sick'

export function TeamPage() {
  const { t } = useTranslation()
  const employment = useEmployment()
  const [params, setParams] = useSearchParams()
  const chats = useChats()
  const chatUnread = (chats.data ?? []).reduce((n, c) => n + c.unreadCount, 0)

  const canApprove = can(employment, 'leave.approve') || can(employment, 'leave.view')
  const canSick = can(employment, 'sick_leave.view')

  // Counts for the manager tabs share the cache with the tabs themselves.
  const leave = useQuery({
    queryKey: queryKeys.teamLeave(employment.hospital.id),
    queryFn: () => teamRepository.fetchTeamLeaveRequests(employment.hospital.id, employment.employeeId),
    enabled: canApprove,
  })
  const sick = useQuery({
    queryKey: queryKeys.teamSick(employment.hospital.id),
    queryFn: () => teamRepository.fetchTeamSickLeaves(employment.hospital.id, employment.employeeId),
    enabled: canSick,
  })

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: 'duty', label: t('team.onDuty') },
    { id: 'colleagues', label: t('team.colleagues') },
    ...(canApprove ? [{ id: 'requests' as const, label: t('team.leaveRequests'), count: leave.data?.filter((r) => r.status === 'pending').length }] : []),
    ...(canSick ? [{ id: 'sick' as const, label: t('team.sickLeaves'), count: sick.data?.filter((s) => s.status === 'reported').length }] : []),
  ]
  const requested = params.get('tab') as Tab | null
  const active: Tab = tabs.some((x) => x.id === requested) ? requested! : 'duty'

  return (
    <>
      <PageHeader title={t('team.title')} subtitle={employment.hospital.name} />

      {(chats.data?.length ?? 0) > 0 && (
        <Link
          to="/team/chat"
          className="mb-5 flex items-center gap-4 rounded-[var(--radius-card)] border border-border/70 bg-surface p-4 shadow-card transition-transform hover:-translate-y-0.5 sm:p-5"
        >
          <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary-soft text-primary-text">
            <MessagesSquare className="size-5" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[16px] font-semibold">{t('chat.title')}</span>
            <span className="block truncate text-sm text-text-2">
              {chatUnread ? t('chat.unread', { count: chatUnread }) : chats.data!.map((c) => c.unitCode ?? c.unitName).join(' · ')}
            </span>
          </span>
          {chatUnread > 0 && <CountBadge count={chatUnread} />}
        </Link>
      )}

      <div role="tablist" aria-label={t('team.title')} className="-mx-4 mb-6 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            type="button"
            aria-selected={active === tab.id}
            ref={active === tab.id ? (el) => el?.scrollIntoView({ inline: 'center', block: 'nearest' }) : undefined}
            onClick={() => setParams({ tab: tab.id }, { replace: true })}
            className={cn(
              'inline-flex h-11 shrink-0 items-center gap-2 rounded-full px-5 text-[15px] font-semibold transition-colors duration-150',
              active === tab.id ? 'bg-primary text-on-primary shadow-sm' : 'bg-surface text-text-2 shadow-sm ring-1 ring-border/70 hover:text-text',
            )}
          >
            {tab.label}
            {!!tab.count && <CountBadge count={tab.count} className={active === tab.id ? 'bg-white text-primary-text' : ''} />}
          </button>
        ))}
      </div>

      <div key={active} className="animate-fade-in" role="tabpanel">
        {active === 'duty' && <OnDutyTab />}
        {active === 'colleagues' && <ColleaguesTab />}
        {active === 'requests' && <LeaveApprovalsTab />}
        {active === 'sick' && <SickLeavesTab />}
      </div>
    </>
  )
}
