import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { Team, type TeamData } from '@/components/Team'
import { PageHeader } from '@/components/ui'
import { requireAccount } from '@/lib/account'
import { getT } from '@/lib/i18n/server'
import { createClient } from '@/lib/supabase/server'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).t('team.title') }
}

export default async function TeamPage() {
  const account = await requireAccount('/provider/team')
  if (!account.provider) redirect('/provider/onboarding')
  const { t } = await getT()
  const supabase = await createClient()
  const { data } = await supabase.rpc('team_list')
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={t('team.title')} subtitle={account.provider.display_name} back="/provider" />
      <Team data={data as TeamData} />
    </div>
  )
}
