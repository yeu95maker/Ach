import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { BulkImport } from '@/components/BulkImport'
import { Alert, PageHeader } from '@/components/ui'
import { requireAccount } from '@/lib/account'
import { getT } from '@/lib/i18n/server'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).t('import.title') }
}

export default async function ImportPage() {
  const account = await requireAccount('/provider/import')
  if (!account.provider) redirect('/provider/onboarding')
  if (account.provider.status === 'suspended') redirect('/provider')
  const { t } = await getT()
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={t('import.title')} subtitle={t('import.subtitle')} back="/provider" />
      <Alert tone="info" className="mb-4">{t('import.howItWorks')}</Alert>
      <BulkImport />
    </div>
  )
}
