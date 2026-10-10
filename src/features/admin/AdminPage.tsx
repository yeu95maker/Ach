import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'
import { can, canAny } from '@/domain/permissions'
import { useEmployment } from '@/features/tenant/TenantProvider'
import { PageHeader, cn } from '@/ui'
import { EmployeesTab } from './EmployeesTab'
import { IntegrationsTab } from './IntegrationsTab'
import { OrganizationTab } from './OrganizationTab'
import { ShiftTypesTab } from './ShiftTypesTab'

type Tab = 'people' | 'organization' | 'shifts' | 'integrations'

/** Verwaltung: employees, roles, wards and shift types of the hospital. */
export function AdminPage() {
  const { t } = useTranslation()
  const employment = useEmployment()
  const [params, setParams] = useSearchParams()

  const tabs: { id: Tab; label: string }[] = [
    ...(canAny(employment, ['employees.manage', 'roles.assign']) ? [{ id: 'people' as const, label: t('admin.tabs.people') }] : []),
    ...(can(employment, 'organization.manage')
      ? [
          { id: 'organization' as const, label: t('admin.tabs.organization') },
          { id: 'shifts' as const, label: t('admin.tabs.shifts') },
        ]
      : []),
    ...(can(employment, 'integrations.manage') ? [{ id: 'integrations' as const, label: t('admin.tabs.integrations') }] : []),
  ]
  const requested = params.get('tab') as Tab | null
  const active: Tab = tabs.some((x) => x.id === requested) ? requested! : (tabs[0]?.id ?? 'people')

  return (
    <>
      <PageHeader title={t('admin.title')} subtitle={employment.hospital.name} />
      <div role="tablist" aria-label={t('admin.title')} className="-mx-4 mb-6 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            type="button"
            aria-selected={active === tab.id}
            onClick={() => setParams({ tab: tab.id }, { replace: true })}
            className={cn(
              'inline-flex h-11 shrink-0 items-center rounded-full px-5 text-[15px] font-semibold transition-colors',
              active === tab.id ? 'bg-primary text-on-primary shadow-sm' : 'bg-surface text-text-2 shadow-sm ring-1 ring-border/70 hover:text-text',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div key={active} role="tabpanel" className="animate-fade-in">
        {active === 'people' && <EmployeesTab />}
        {active === 'organization' && <OrganizationTab />}
        {active === 'shifts' && <ShiftTypesTab />}
        {active === 'integrations' && <IntegrationsTab />}
      </div>
    </>
  )
}
