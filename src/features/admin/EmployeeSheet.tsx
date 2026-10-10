import { useMutation } from '@tanstack/react-query'
import { Plus, Star, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PersonAvatar } from '@/components/PersonAvatar'
import { errorMessageKey } from '@/core/errors'
import { adminRepository, type AdminEmployee, type EmploymentType } from '@/data/adminRepository'
import { can } from '@/domain/permissions'
import { useEmployment } from '@/features/tenant/TenantProvider'
import { Badge, Button, Field, IconButton, Input, SectionTitle, Select, Sheet, useToast } from '@/ui'
import { useAdminRefresh, useAssignableRoles, useOrganization } from './useAdmin'

const EMPLOYMENT_TYPES: EmploymentType[] = ['full_time', 'part_time', 'marginal', 'trainee', 'agency', 'other']

function MasterData({ employee }: { employee: AdminEmployee }) {
  const { t, i18n } = useTranslation()
  const toast = useToast()
  const refresh = useAdminRefresh()
  const [jobTitle, setJobTitle] = useState(employee.jobTitle)
  const [personnelNumber, setPersonnelNumber] = useState(employee.personnelNumber ?? '')
  const [type, setType] = useState<EmploymentType>(employee.employmentType)
  const [hours, setHours] = useState(
    employee.weeklyHours === null ? '' : new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 1, useGrouping: false }).format(employee.weeklyHours),
  )

  const save = useMutation({
    mutationFn: () =>
      adminRepository.updateEmployee(employee.employeeId, {
        job_title: jobTitle.trim(),
        personnel_number: personnelNumber.trim() || null,
        employment_type: type,
        weekly_hours: hours.trim() ? Number(hours.replace(',', '.')) : null,
      }),
    onSuccess: () => {
      toast.show({ tone: 'success', title: t('admin.saved') })
      void refresh()
    },
    onError: (e) => toast.show({ tone: 'error', title: t('errors.title'), description: t(errorMessageKey(e)) }),
  })

  return (
    <section>
      <SectionTitle>{t('admin.people.masterData')}</SectionTitle>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('admin.people.jobTitle')} htmlFor="emp-job">
          <Input id="emp-job" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} maxLength={120} />
        </Field>
        <Field label={t('admin.people.personnelNumber')} htmlFor="emp-pn" optional optionalLabel={t('common.optional')}>
          <Input id="emp-pn" value={personnelNumber} onChange={(e) => setPersonnelNumber(e.target.value)} maxLength={32} />
        </Field>
        <Field label={t('admin.people.employmentType')} htmlFor="emp-type">
          <Select id="emp-type" value={type} onChange={(e) => setType(e.target.value as EmploymentType)}>
            {EMPLOYMENT_TYPES.map((x) => (
              <option key={x} value={x}>
                {t(`admin.employmentType.${x}`)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('admin.people.weeklyHours')} htmlFor="emp-hours" optional optionalLabel={t('common.optional')}>
          <Input id="emp-hours" inputMode="decimal" value={hours} onChange={(e) => setHours(e.target.value)} />
        </Field>
      </div>
      <div className="mt-3 flex justify-end">
        <Button size="sm" loading={save.isPending} onClick={() => save.mutate()}>
          {t('common.save')}
        </Button>
      </div>
    </section>
  )
}

export function EmployeeSheet({ employee, onClose }: { employee: AdminEmployee | null; onClose: () => void }) {
  const { t } = useTranslation()
  const employment = useEmployment()
  const toast = useToast()
  const refresh = useAdminRefresh()
  const org = useOrganization()
  const roles = useAssignableRoles()
  const [unitToAdd, setUnitToAdd] = useState('')
  const [roleToAdd, setRoleToAdd] = useState('')
  const [scope, setScope] = useState('hospital')
  const canManage = can(employment, 'employees.manage')
  const canRoles = can(employment, 'roles.assign')
  const hospitalId = employment.hospital.id
  const isSelf = employee?.employeeId === employment.employeeId

  const units = (org.data ?? []).flatMap((d) => d.units.filter((u) => u.isActive))
  const run = useMutation({
    mutationFn: (fn: () => Promise<unknown>) => fn(),
    onSuccess: () => void refresh(),
    onError: (e) => toast.show({ tone: 'error', title: t('errors.title'), description: t(errorMessageKey(e)) }),
  })

  const setStatus = useMutation({
    mutationFn: (v: { employeeId: string; status: 'active' | 'inactive' }) => adminRepository.updateEmployee(v.employeeId, { status: v.status }),
    onSuccess: (_, v) => {
      toast.show({ tone: 'success', title: v.status === 'inactive' ? t('admin.people.deactivated') : t('admin.people.reactivated') })
      void refresh()
    },
    onError: (e) => toast.show({ tone: 'error', title: t('errors.title'), description: t(errorMessageKey(e)) }),
  })

  if (!employee) return <Sheet open={false} onClose={onClose} closeLabel={t('common.close')} title="">{null}</Sheet>

  const scopeLabel = (r: AdminEmployee['roles'][number]) =>
    r.unitName ? t('admin.scope.unit', { name: r.unitName }) : r.departmentName ? t('admin.scope.department', { name: r.departmentName }) : t('admin.scope.hospital')

  const addRole = () => {
    if (!roleToAdd) return
    const [kind, id] = scope.split(':')
    run.mutate(
      () => adminRepository.addRole(hospitalId, employee.employeeId, roleToAdd, kind === 'unit' ? { unitId: id } : kind === 'department' ? { departmentId: id } : {}),
      { onSuccess: () => setRoleToAdd('') },
    )
  }

  return (
    <Sheet
      open
      onClose={onClose}
      closeLabel={t('common.close')}
      size="lg"
      title={`${employee.firstName} ${employee.lastName}`}
      description={employee.email}
      footer={
        canManage && !isSelf ? (
          <Button
            variant={employee.status === 'active' ? 'secondary' : 'primary'}
            size="lg"
            fullWidth
            loading={setStatus.isPending}
            onClick={() => setStatus.mutate({ employeeId: employee.employeeId, status: employee.status === 'active' ? 'inactive' : 'active' })}
          >
            {employee.status === 'active' ? t('admin.people.deactivate') : t('admin.people.reactivate')}
          </Button>
        ) : undefined
      }
    >
      <div className="space-y-7">
        <div className="flex items-center gap-3">
          <PersonAvatar person={employee} size="lg" />
          <div className="min-w-0">
            <p className="text-sm text-text-2">{employee.phone ?? t('profile.noPhone')}</p>
            {employee.status === 'inactive' && <Badge className="mt-1">{t('admin.people.inactive')}</Badge>}
          </div>
        </div>

        {canManage && <MasterData key={employee.employeeId} employee={employee} />}

        <section>
          <SectionTitle>{t('admin.people.units')}</SectionTitle>
          <ul className="space-y-2">
            {employee.units.map((u) => (
              <li key={u.id} className="flex items-center gap-2 rounded-2xl bg-surface-2/70 px-4 py-2.5">
                <span className="min-w-0 flex-1 truncate text-[15px] font-medium">{u.name}</span>
                {u.isPrimary ? (
                  <Badge tone="primary">{t('admin.people.primary')}</Badge>
                ) : (
                  canManage && (
                    <IconButton label={t('admin.people.makePrimary')} onClick={() => run.mutate(() => adminRepository.setPrimaryUnit(employee.employeeId, u.id))}>
                      <Star className="size-[18px]" />
                    </IconButton>
                  )
                )}
                {canManage && (
                  <IconButton label={t('admin.people.removeUnit')} onClick={() => run.mutate(() => adminRepository.removeUnit(employee.employeeId, u.id))}>
                    <Trash2 className="size-[18px]" />
                  </IconButton>
                )}
              </li>
            ))}
            {employee.units.length === 0 && <li className="text-sm text-text-3">{t('admin.people.noUnit')}</li>}
          </ul>
          {canManage && (
            <div className="mt-3 flex gap-2">
              <Select aria-label={t('admin.people.addUnit')} value={unitToAdd} onChange={(e) => setUnitToAdd(e.target.value)} className="flex-1">
                <option value="">{t('admin.people.addUnit')}</option>
                {units
                  .filter((u) => !employee.units.some((x) => x.id === u.id))
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
              </Select>
              <Button
                variant="secondary"
                icon={<Plus className="size-[18px]" />}
                disabled={!unitToAdd}
                onClick={() => run.mutate(() => adminRepository.addUnit(hospitalId, employee.employeeId, unitToAdd, employee.units.length === 0), { onSuccess: () => setUnitToAdd('') })}
              >
                {t('admin.add')}
              </Button>
            </div>
          )}
        </section>

        <section>
          <SectionTitle>{t('admin.people.roles')}</SectionTitle>
          <ul className="space-y-2">
            {employee.roles.map((r) => (
              <li key={r.assignmentId} className="flex items-center gap-2 rounded-2xl bg-surface-2/70 px-4 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-medium">{t(`admin.role.${r.roleKey}`, { defaultValue: r.roleName })}</span>
                  <span className="block truncate text-sm text-text-3">{scopeLabel(r)}</span>
                </span>
                {canRoles && (
                  <IconButton label={t('admin.people.removeRole')} onClick={() => run.mutate(() => adminRepository.removeRole(r.assignmentId))}>
                    <Trash2 className="size-[18px]" />
                  </IconButton>
                )}
              </li>
            ))}
            {employee.roles.length === 0 && <li className="text-sm text-text-3">{t('admin.people.noRoles')}</li>}
          </ul>
          {canRoles && (
            <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
              <Select aria-label={t('admin.people.role')} value={roleToAdd} onChange={(e) => setRoleToAdd(e.target.value)}>
                <option value="">{t('admin.people.addRole')}</option>
                {(roles.data ?? []).map((r) => (
                  <option key={r.roleId} value={r.roleId}>
                    {t(`admin.role.${r.roleKey}`, { defaultValue: r.roleName })}
                  </option>
                ))}
              </Select>
              <Select aria-label={t('admin.people.scope')} value={scope} onChange={(e) => setScope(e.target.value)}>
                <option value="hospital">{t('admin.scope.hospital')}</option>
                {(org.data ?? []).map((d) => (
                  <optgroup key={d.id} label={d.name}>
                    <option value={`department:${d.id}`}>{t('admin.scope.department', { name: d.name })}</option>
                    {d.units
                      .filter((u) => u.isActive)
                      .map((u) => (
                        <option key={u.id} value={`unit:${u.id}`}>
                          {t('admin.scope.unit', { name: u.name })}
                        </option>
                      ))}
                  </optgroup>
                ))}
              </Select>
              <Button variant="secondary" icon={<Plus className="size-[18px]" />} disabled={!roleToAdd} onClick={addRole}>
                {t('admin.add')}
              </Button>
            </div>
          )}
          <p className="mt-2 text-xs text-text-3">{t('admin.people.rolesHint')}</p>
        </section>
      </div>
    </Sheet>
  )
}
