import { UserX } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { errorMessageKey } from '@/core/errors'
import type { DeletionRequest } from '@/data/accountRepository'
import { useHospitalFormatter } from '@/features/tenant/useHospitalFormatter'
import { Button, Field, Sheet, Textarea, useToast } from '@/ui'

/** Start the account deletion inside the app; the administration completes it. */
export function DeleteAccountSheet({
  open,
  onClose,
  pending,
  onRequest,
  onWithdraw,
  busy,
}: {
  open: boolean
  onClose: () => void
  pending: DeletionRequest | null
  onRequest: (note: string | null) => Promise<void>
  onWithdraw: () => Promise<void>
  busy: boolean
}) {
  const { t } = useTranslation()
  const fmt = useHospitalFormatter()
  const toast = useToast()
  const [note, setNote] = useState('')
  const fail = (e: unknown) => toast.show({ tone: 'error', title: t('errors.title'), description: t(errorMessageKey(e)) })

  return (
    <Sheet open={open} onClose={onClose} closeLabel={t('common.close')} title={t('account.deleteTitle')} description={t('account.deleteHint')}>
      <div className="space-y-4">
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-text-2">
          <li>{t('account.deleteStep1')}</li>
          <li>{t('account.deleteStep2')}</li>
          <li>{t('account.deleteStep3')}</li>
        </ul>
        {pending ? (
          <>
            <p className="rounded-2xl bg-warning-soft px-4 py-3 text-sm font-medium text-warning-text">
              {t('account.requestedOn', { when: fmt.relative(pending.requestedAt) })}
            </p>
            <Button fullWidth variant="secondary" loading={busy} onClick={() => void onWithdraw().then(onClose, fail)}>
              {t('account.withdraw')}
            </Button>
          </>
        ) : (
          <>
            <Field label={t('account.note')} htmlFor="delete-note" optional optionalLabel={t('common.optional')}>
              <Textarea id="delete-note" rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
            <Button
              fullWidth
              variant="danger"
              icon={<UserX className="size-4" />}
              loading={busy}
              onClick={() =>
                void onRequest(note.trim() || null).then(() => {
                  toast.show({ tone: 'success', title: t('account.requested'), description: t('account.requestedHint') })
                  onClose()
                }, fail)
              }
            >
              {t('account.request')}
            </Button>
          </>
        )}
      </div>
    </Sheet>
  )
}
