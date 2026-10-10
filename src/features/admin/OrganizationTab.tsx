import { useMutation } from '@tanstack/react-query'
import { Building2, Pencil, Plus } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { QueryError } from '@/components/QueryState'
import { errorMessageKey } from '@/core/errors'
import { adminRepository, type OrgDepartment } from '@/data/adminRepository'
import { useEmployment } from '@/features/tenant/TenantProvider'
import { Badge, Button, Card, CardHeader, EmptyState, Field, IconButton, Input, Select, Sheet, SkeletonCard, useToast } from '@/ui'
import { useAdminRefresh, useOrganization } from './useAdmin'

type Editing =
  | { kind: 'department'; id?: string; name: string; code: string; isActive: boolean }
  | { kind: 'unit'; id?: string; departmentId: string; name: string; code: string; isActive: boolean }

export function OrganizationTab() {
  const { t } = useTranslation()
  const employment = useEmployment()
  const toast = useToast()
  const refresh = useAdminRefresh()
  const org = useOrganization()
  const [editing, setEditing] = useState<Editing | null>(null)

  const save = useMutation({
    mutationFn: (e: Editing) =>
      e.kind === 'department'
        ? adminRepository.saveDepartment(employment.hospital.id, { id: e.id, name: e.name, code: e.code || null, isActive: e.isActive })
        : adminRepository.saveUnit(employment.hospital.id, { id: e.id, departmentId: e.departmentId, name: e.name, code: e.code || null, isActive: e.isActive }),
    onSuccess: () => {
      toast.show({ tone: 'success', title: t('admin.saved') })
      setEditing(null)
      void refresh()
    },
    onError: (e) => toast.show({ tone: 'error', title: t('errors.title'), description: t(errorMessageKey(e)) }),
  })

  const editDept = (d?: OrgDepartment) => setEditing({ kind: 'department', id: d?.id, name: d?.name ?? '', code: d?.code ?? '', isActive: d?.isActive ?? true })

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <Button icon={<Plus className="size-[18px]" />} onClick={() => editDept()}>
          {t('admin.org.addDepartment')}
        </Button>
      </div>

      {org.isLoading && <SkeletonCard lines={4} />}
      {org.error && <QueryError error={org.error} onRetry={() => void org.refetch()} />}
      {org.data?.length === 0 && (
        <Card>
          <EmptyState icon={<Building2 />} title={t('admin.org.empty')} />
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {(org.data ?? []).map((d) => (
          <Card key={d.id}>
            <CardHeader
              title={
                <span className="flex flex-wrap items-center gap-2">
                  {d.name}
                  {d.code && <Badge>{d.code}</Badge>}
                  {!d.isActive && <Badge tone="warning">{t('admin.inactive')}</Badge>}
                </span>
              }
              subtitle={t('admin.org.unitCount', { count: d.units.length })}
              action={
                <IconButton label={t('admin.edit')} onClick={() => editDept(d)}>
                  <Pencil className="size-[18px]" />
                </IconButton>
              }
            />
            <ul className="space-y-2">
              {d.units.map((u) => (
                <li key={u.id} className="flex items-center gap-2 rounded-2xl bg-surface-2/70 px-4 py-2.5">
                  <span className="min-w-0 flex-1 truncate text-[15px] font-medium">{u.name}</span>
                  {u.code && <Badge>{u.code}</Badge>}
                  {!u.isActive && <Badge tone="warning">{t('admin.inactive')}</Badge>}
                  <IconButton
                    label={t('admin.edit')}
                    onClick={() => setEditing({ kind: 'unit', id: u.id, departmentId: d.id, name: u.name, code: u.code ?? '', isActive: u.isActive })}
                  >
                    <Pencil className="size-[18px]" />
                  </IconButton>
                </li>
              ))}
            </ul>
            <Button
              variant="ghost"
              size="sm"
              className="mt-3"
              icon={<Plus className="size-4" />}
              onClick={() => setEditing({ kind: 'unit', departmentId: d.id, name: '', code: '', isActive: true })}
            >
              {t('admin.org.addUnit')}
            </Button>
          </Card>
        ))}
      </div>

      <Sheet
        open={!!editing}
        onClose={() => setEditing(null)}
        closeLabel={t('common.close')}
        title={
          editing?.kind === 'department'
            ? editing.id ? t('admin.org.editDepartment') : t('admin.org.addDepartment')
            : editing?.id ? t('admin.org.editUnit') : t('admin.org.addUnit')
        }
        footer={
          <div className="grid gap-3 sm:grid-cols-2">
            <Button variant="secondary" size="lg" onClick={() => setEditing(null)}>
              {t('common.cancel')}
            </Button>
            <Button size="lg" loading={save.isPending} disabled={!editing?.name.trim()} onClick={() => editing && save.mutate(editing)}>
              {t('common.save')}
            </Button>
          </div>
        }
      >
        {editing && (
          <div className="space-y-4">
            {editing.kind === 'unit' && (
              <Field label={t('admin.org.department')} htmlFor="org-dept">
                <Select id="org-dept" value={editing.departmentId} onChange={(e) => setEditing({ ...editing, departmentId: e.target.value })}>
                  {(org.data ?? []).map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            <Field label={t('admin.org.name')} htmlFor="org-name">
              <Input
                id="org-name"
                value={editing.name}
                maxLength={200}
                placeholder={editing.kind === 'unit' ? t('admin.org.unitPlaceholder') : t('admin.org.departmentPlaceholder')}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              />
            </Field>
            <Field label={t('admin.org.code')} htmlFor="org-code" optional optionalLabel={t('common.optional')}>
              <Input id="org-code" value={editing.code} maxLength={32} onChange={(e) => setEditing({ ...editing, code: e.target.value })} />
            </Field>
            <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-border/70 p-4">
              <input type="checkbox" checked={editing.isActive} onChange={(e) => setEditing({ ...editing, isActive: e.target.checked })} className="size-5 accent-[var(--color-primary)]" />
              <span className="text-[15px] font-medium">{t('admin.activeLabel')}</span>
            </label>
          </div>
        )}
      </Sheet>
    </div>
  )
}
