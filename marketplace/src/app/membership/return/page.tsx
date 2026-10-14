import { PaymentWaiter } from '@/components/MembershipActions'
import { Card, PageHeader } from '@/components/ui'
import { requireAccount } from '@/lib/account'
import { getT } from '@/lib/i18n/server'
import { safeNext } from '@/lib/next'

/** Paynow sends the customer back here after the card / Paynow page. */
export default async function PaymentReturnPage({ searchParams }: PageProps<'/membership/return'>) {
  const params = await searchParams
  const reference = typeof params.reference === 'string' ? params.reference : ''
  await requireAccount(`/membership/return?reference=${reference}`)
  const { t } = await getT()
  return (
    <div className="mx-auto max-w-md">
      <PageHeader title={t('pay.title')} />
      <Card className="p-6">
        <PaymentWaiter reference={reference} instructions={null} method="return" next={safeNext(params.next, '/membership')} />
      </Card>
    </div>
  )
}
