import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { ListingWizard } from '@/components/ListingWizard'
import { requireAccount } from '@/lib/account'
import { getT } from '@/lib/i18n/server'
import { emptyDraft } from '@/lib/listing'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).t('nav.addProperty') }
}

export default async function NewPropertyPage() {
  const account = await requireAccount('/provider/properties/new')
  const provider = account.provider
  if (!provider) redirect('/provider/onboarding')
  if (provider.status === 'suspended') redirect('/provider')
  return (
    <ListingWizard initial={emptyDraft(crypto.randomUUID())} providerId={provider.id} providerName={provider.display_name}
      verified={provider.status === 'verified'} isNew />
  )
}
