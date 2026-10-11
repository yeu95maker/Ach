import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { UserX } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { errorMessageKey } from '@/core/errors'
import { accountRepository } from '@/data/accountRepository'
import { useEmployment } from '@/features/tenant/TenantProvider'
import { useHospitalFormatter } from '@/features/tenant/useHospitalFormatter'
import { Button, Card, CardHeader, useToast } from '@/ui'
import { adminKeys } from './useAdmin'

/** Open in-app account deletion requests; closing one blocks access right away. */
export function DeletionRequests() {
  const { t } = useTranslation()
  const fmt = useHospitalFormatter()
  const toast = useToast()
  const { hospital } = useEmployment()
  const queryClient = useQueryClient()
  const requests = useQuery({ queryKey: ['deletion-requests', hospital.id], queryFn: () => accountRepository.fetchOpen(hospital.id) })
  const complete = useMutation({
    mutationFn: (id: string) => accountRepository.complete(id, hospital.id),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ['deletion-requests', hospital.id] }),
        queryClient.invalidateQueries({ queryKey: adminKeys.employees(hospital.id) }),
      ]),
  })
  if (!requests.data?.length) return null

  return (
    <Card className="border-danger/30" data-testid="deletion-requests">
      <CardHeader
        title={t('account.adminTitle')}
        subtitle={t('account.adminHint')}
        icon={
          <span className="flex size-10 items-center justify-center rounded-xl bg-danger-soft text-danger-text">
            <UserX className="size-5" />
          </span>
        }
      />
      <ul className="space-y-2">
        {requests.data.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-surface-2/70 px-4 py-3">
            <span className="min-w-0">
              <span className="block truncate text-[15px] font-medium">{r.name}</span>
              <span className="block truncate text-sm text-text-3">
                {r.email} · {fmt.relative(r.requestedAt)}
                {r.note && ` · „${r.note}“`}
              </span>
            </span>
            <Button
              size="sm"
              variant="danger"
              loading={complete.isPending && complete.variables === r.id}
              onClick={() => {
                if (window.confirm(t('account.adminConfirm', { name: r.name })))
                  void complete.mutateAsync(r.id).then(
                    () => toast.show({ tone: 'success', title: t('account.adminDone') }),
                    (e: unknown) => toast.show({ tone: 'error', title: t('errors.title'), description: t(errorMessageKey(e)) }),
                  )
              }}
            >
              {t('account.adminComplete')}
            </Button>
          </li>
        ))}
      </ul>
    </Card>
  )
}
