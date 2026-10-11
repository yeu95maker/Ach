import { notFound, redirect } from 'next/navigation'
import { ListingWizard } from '@/components/ListingWizard'
import { requireAccount } from '@/lib/account'
import { draftFromRow } from '@/lib/listing'
import { createClient } from '@/lib/supabase/server'

export default async function EditPropertyPage({ params }: PageProps<'/provider/properties/[id]/edit'>) {
  const { id } = await params
  const account = await requireAccount(`/provider/properties/${id}/edit`)
  const provider = account.provider
  if (!provider) redirect('/provider/onboarding')
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()
  const supabase = await createClient()
  const { data } = await supabase.rpc('get_my_property', { p_id: id })
  const row = data as Record<string, unknown> | null
  if (!row || row.provider_id !== provider.id || row.status === 'removed' || row.status === 'sold') notFound()
  return (
    <ListingWizard initial={draftFromRow(row)} providerId={provider.id} providerName={provider.display_name}
      verified={provider.status === 'verified'} isNew={false} />
  )
}
