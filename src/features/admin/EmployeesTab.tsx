import { Search, UserPlus, UsersRound } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PersonAvatar } from '@/components/PersonAvatar'
import { QueryError } from '@/components/QueryState'
import type { AdminEmployee } from '@/data/adminRepository'
import { can } from '@/domain/permissions'
import { useEmployment } from '@/features/tenant/TenantProvider'
import { Badge, Button, Card, EmptyState, Input, SegmentedControl, SkeletonCard } from '@/ui'
import { EmployeeSheet } from './EmployeeSheet'
import { InviteSheet } from './InviteSheet'
import { useAdminEmployees } from './useAdmin'

type StatusFilter = 'active' | 'inactive' | 'all'

export function EmployeesTab() {
  const { t } = useTranslation()
  const employment = useEmployment()
  const employees = useAdminEmployees()
  const [term, setTerm] = useState('')
  const [status, setStatus] = useState<StatusFilter>('active')
  const [openId, setOpenId] = useState<string | null>(null)
  const [inviting, setInviting] = useState(false)
  const canInvite = can(employment, 'employees.manage') && can(employment, 'roles.assign')

  const list = useMemo(() => {
    const q = term.trim().toLowerCase()
    return (employees.data ?? [])
      .filter((e) => status === 'all' || e.status === status)
      .filter((e) => !q || `${e.firstName} ${e.lastName} ${e.email} ${e.jobTitle} ${e.personnelNumber ?? ''} ${e.units.map((u) => u.name).join(' ')}`.toLowerCase().includes(q))
  }, [employees.data, term, status])

  const selected: AdminEmployee | null = employees.data?.find((e) => e.employeeId === openId) ?? null

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-4 size-[18px] -translate-y-1/2 text-text-3" aria-hidden />
          <Input value={term} onChange={(e) => setTerm(e.target.value)} placeholder={t('admin.people.search')} aria-label={t('admin.people.search')} className="pl-11" />
        </div>
        <SegmentedControl
          label={t('admin.people.status')}
          value={status}
          onChange={setStatus}
          options={[
            { value: 'active', label: t('admin.people.active') },
            { value: 'inactive', label: t('admin.people.inactive') },
            { value: 'all', label: t('news.all') },
          ]}
          className="sm:w-[300px]"
        />
        {canInvite && (
          <Button icon={<UserPlus className="size-[18px]" />} onClick={() => setInviting(true)}>
            {t('admin.people.invite')}
          </Button>
        )}
      </div>

      {employees.isLoading && <SkeletonCard lines={5} />}
      {employees.error && <QueryError error={employees.error} onRetry={() => void employees.refetch()} />}
      {employees.data && list.length === 0 && (
        <Card>
          <EmptyState icon={<UsersRound />} title={t('team.noResults')} />
        </Card>
      )}

      {list.length > 0 && (
        <Card padding="none">
          <ul className="divide-y divide-border/70">
            {list.map((e) => (
              <li key={e.employeeId}>
                <button type="button" onClick={() => setOpenId(e.employeeId)} className="flex w-full items-center gap-3.5 px-4 py-3.5 text-left transition-colors hover:bg-surface-2/60 sm:px-5">
                  <PersonAvatar person={e} />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-[15px] font-semibold">{`${e.firstName} ${e.lastName}`}</span>
                      {e.status === 'inactive' && <Badge>{t('admin.people.inactive')}</Badge>}
                    </span>
                    <span className="block truncate text-sm text-text-2">
                      {[e.jobTitle, e.units.find((u) => u.isPrimary)?.name ?? e.units[0]?.name].filter(Boolean).join(' · ') || e.email}
                    </span>
                    <span className="mt-1 flex flex-wrap gap-1.5">
                      {e.roles.map((r) => (
                        <Badge key={r.assignmentId} tone="primary">
                          {t(`admin.role.${r.roleKey}`, { defaultValue: r.roleName })}
                        </Badge>
                      ))}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <EmployeeSheet employee={selected} onClose={() => setOpenId(null)} />
      {canInvite && <InviteSheet open={inviting} onClose={() => setInviting(false)} />}
    </div>
  )
}
