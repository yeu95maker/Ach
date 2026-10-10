import { Send } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation } from '@tanstack/react-query'
import { errorMessageKey } from '@/core/errors'
import { adminRepository } from '@/data/adminRepository'
import { useEmployment } from '@/features/tenant/TenantProvider'
import { Button, Field, Input, Select, Sheet, useToast } from '@/ui'
import { useAdminRefresh, useAssignableRoles, useOrganization } from './useAdmin'

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

export function InviteSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, i18n } = useTranslation()
  const employment = useEmployment()
  const toast = useToast()
  const refresh = useAdminRefresh()
  const roles = useAssignableRoles()
  const org = useOrganization()
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', jobTitle: '', unitId: '', roleKey: 'nurse' })
  const [touched, setTouched] = useState(false)
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const units = (org.data ?? []).flatMap((d) => d.units.filter((u) => u.isActive).map((u) => ({ ...u, departmentName: d.name })))
  const valid = form.firstName.trim() && form.lastName.trim() && EMAIL.test(form.email.trim())

  const invite = useMutation({
    mutationFn: () =>
      adminRepository.invite({
        hospitalId: employment.hospital.id,
        email: form.email,
        firstName: form.firstName,
        lastName: form.lastName,
        jobTitle: form.jobTitle,
        unitId: form.unitId || null,
        roleKey: form.roleKey,
        locale: i18n.language,
      }),
    onSuccess: (r) => {
      toast.show({ tone: 'success', title: r.invited ? t('admin.people.invited') : t('admin.people.added'), description: r.invited ? t('admin.people.invitedHint') : undefined })
      void refresh()
      setForm({ firstName: '', lastName: '', email: '', jobTitle: '', unitId: '', roleKey: 'nurse' })
      setTouched(false)
      onClose()
    },
    onError: (e) => toast.show({ tone: 'error', title: t('errors.title'), description: t(errorMessageKey(e)) }),
  })

  return (
    <Sheet
      open={open}
      onClose={onClose}
      closeLabel={t('common.close')}
      title={t('admin.people.inviteTitle')}
      description={t('admin.people.inviteHint')}
      footer={
        <div className="grid gap-3 sm:grid-cols-2">
          <Button variant="secondary" size="lg" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            size="lg"
            icon={<Send className="size-[18px]" />}
            loading={invite.isPending}
            onClick={() => {
              setTouched(true)
              if (valid) invite.mutate()
            }}
          >
            {t('admin.people.sendInvite')}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('admin.people.firstName')} htmlFor="inv-first" error={touched && !form.firstName.trim() ? t('admin.required') : null}>
            <Input id="inv-first" value={form.firstName} onChange={set('firstName')} autoComplete="off" />
          </Field>
          <Field label={t('admin.people.lastName')} htmlFor="inv-last" error={touched && !form.lastName.trim() ? t('admin.required') : null}>
            <Input id="inv-last" value={form.lastName} onChange={set('lastName')} autoComplete="off" />
          </Field>
        </div>
        <Field label={t('auth.email')} htmlFor="inv-email" error={touched && !EMAIL.test(form.email.trim()) ? t('admin.people.emailInvalid') : null}>
          <Input id="inv-email" type="email" inputMode="email" value={form.email} onChange={set('email')} autoComplete="off" />
        </Field>
        <Field label={t('admin.people.jobTitle')} htmlFor="inv-job" optional optionalLabel={t('common.optional')}>
          <Input id="inv-job" value={form.jobTitle} onChange={set('jobTitle')} placeholder={t('admin.people.jobTitlePlaceholder')} />
        </Field>
        <Field label={t('admin.people.unit')} htmlFor="inv-unit" optional optionalLabel={t('common.optional')}>
          <Select id="inv-unit" value={form.unitId} onChange={set('unitId')}>
            <option value="">{t('admin.people.noUnit')}</option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('admin.people.role')} htmlFor="inv-role" hint={form.unitId ? t('admin.people.roleScopeUnit') : t('admin.people.roleScopeHospital')}>
          <Select id="inv-role" value={form.roleKey} onChange={set('roleKey')}>
            {(roles.data ?? []).map((r) => (
              <option key={r.roleId} value={r.roleKey}>
                {t(`admin.role.${r.roleKey}`, { defaultValue: r.roleName })}
              </option>
            ))}
          </Select>
        </Field>
      </div>
    </Sheet>
  )
}
