import { useQuery } from '@tanstack/react-query'
import { Search, UsersRound } from 'lucide-react'
import { useDeferredValue, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { QueryError, Stagger } from '@/components/QueryState'
import { teamRepository, type EmployeeOverviewItem } from '@/data/teamRepository'
import { can } from '@/domain/permissions'
import type { Colleague } from '@/domain/types'
import { queryKeys } from '@/features/queryKeys'
import { useEmployment } from '@/features/tenant/TenantProvider'
import { EmptyState, Input, SkeletonCard } from '@/ui'
import { ColleagueCard } from './ColleagueCard'

/** Colleague directory. Managers with employees.view additionally see contact details of their scope. */
export function ColleaguesTab() {
  const { t } = useTranslation()
  const employment = useEmployment()
  const withContacts = can(employment, 'employees.view')
  const [search, setSearch] = useState('')
  const term = useDeferredValue(search.trim().toLowerCase())

  const directory = useQuery({
    queryKey: queryKeys.directory(employment.hospital.id),
    queryFn: () => teamRepository.fetchDirectory(employment.hospital.id),
  })
  const overview = useQuery({
    queryKey: queryKeys.employeeOverview(employment.hospital.id),
    queryFn: () => teamRepository.fetchEmployeeOverview(employment.hospital.id),
    enabled: withContacts,
  })

  const people = useMemo(() => {
    const contacts = new Map((overview.data ?? []).map((e) => [e.employeeId, e]))
    return (directory.data ?? [])
      .filter((c) => c.employeeId !== employment.employeeId)
      .map((c): Colleague & Partial<EmployeeOverviewItem> => ({ ...c, ...contacts.get(c.employeeId) }))
      .filter((c) => !term || `${c.firstName} ${c.lastName} ${c.jobTitle} ${c.primaryUnitName ?? ''}`.toLowerCase().includes(term))
  }, [directory.data, overview.data, term, employment.employeeId])

  return (
    <div className="space-y-6">
      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-text-3" aria-hidden />
        <Input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('team.searchPlaceholder')}
          aria-label={t('team.searchPlaceholder')}
          className="pl-12"
        />
      </div>

      {directory.isLoading && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2, 3].map((i) => <SkeletonCard key={i} lines={2} />)}
        </div>
      )}
      {directory.error && <QueryError error={directory.error} onRetry={() => void directory.refetch()} />}
      {directory.data && people.length === 0 && <EmptyState icon={<UsersRound />} title={t('team.noResults')} />}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {people.map((p, i) => (
          <Stagger key={p.employeeId} index={i}>
            <ColleagueCard
              person={{
                firstName: p.firstName,
                lastName: p.lastName,
                avatarPath: p.avatarPath,
                jobTitle: p.jobTitle,
                unitName: p.primaryUnitName,
                qualifications: p.qualifications,
                languages: p.languages,
                email: p.email,
                phone: p.phone,
              }}
            />
          </Stagger>
        ))}
      </div>
    </div>
  )
}
