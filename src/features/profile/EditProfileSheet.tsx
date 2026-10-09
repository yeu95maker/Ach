import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { errorMessageKey } from '@/core/errors'
import { profileRepository } from '@/data/profileRepository'
import type { UserProfile } from '@/domain/types'
import { queryKeys } from '@/features/queryKeys'
import { Button, Field, Input, Sheet, useToast } from '@/ui'

export function EditProfileSheet({ user, open, onClose }: { user: UserProfile; open: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [firstName, setFirstName] = useState(user.firstName)
  const [lastName, setLastName] = useState(user.lastName)
  const [phone, setPhone] = useState(user.phone ?? '')

  const save = useMutation({
    mutationFn: () => profileRepository.update(user.id, { firstName, lastName, phone }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.context(user.id) })
      toast.show({ tone: 'success', title: t('profile.saved') })
      onClose()
    },
    onError: (e) => toast.show({ tone: 'error', title: t('errors.title'), description: t(errorMessageKey(e)) }),
  })

  return (
    <Sheet
      open={open}
      onClose={onClose}
      closeLabel={t('common.close')}
      title={t('profile.editTitle')}
      footer={
        <Button size="lg" fullWidth loading={save.isPending} disabled={!firstName.trim() || !lastName.trim()} onClick={() => save.mutate()}>
          {t('common.save')}
        </Button>
      }
    >
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('profile.firstName')} htmlFor="first-name">
            <Input id="first-name" autoComplete="given-name" value={firstName} maxLength={100} onChange={(e) => setFirstName(e.target.value)} />
          </Field>
          <Field label={t('profile.lastName')} htmlFor="last-name">
            <Input id="last-name" autoComplete="family-name" value={lastName} maxLength={100} onChange={(e) => setLastName(e.target.value)} />
          </Field>
        </div>
        <Field label={t('profile.phone')} htmlFor="phone" optional optionalLabel={t('common.optional')} hint={t('profile.phoneHint')}>
          <Input id="phone" type="tel" autoComplete="tel" value={phone} maxLength={40} onChange={(e) => setPhone(e.target.value)} />
        </Field>
        <Field label={t('auth.email')} htmlFor="email-ro" hint={t('profile.emailHint')}>
          <Input id="email-ro" value={user.email} disabled readOnly />
        </Field>
      </div>
    </Sheet>
  )
}
