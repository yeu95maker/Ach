import { Home } from 'lucide-react'
import type { Metadata } from 'next'
import { ClaimButton } from '@/components/ManagedOwners'
import { Alert, Card, EmptyState, LinkButton } from '@/components/ui'
import { getAccount } from '@/lib/account'
import { BRAND } from '@/lib/brand'
import { getT } from '@/lib/i18n/server'
import { createClient } from '@/lib/supabase/server'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).t('claim.title'), robots: { index: false } }
}

/** Owners whose listings an admin set up take over their profile here (link from email or WhatsApp). */
export default async function ClaimPage({ searchParams }: PageProps<'/claim'>) {
  const token = (await searchParams).token
  const { t } = await getT()
  const supabase = await createClient()
  const { data } = typeof token === 'string' ? await supabase.rpc('get_claim', { p_token: token }) : { data: null }
  const claim = data as { provider: string; contact_name: string | null; listings: number } | null
  if (!claim || typeof token !== 'string') {
    return <EmptyState icon={<Home className="size-8" />} title={t('claim.invalidTitle')} text={t('claim.invalidText')} />
  }
  const account = await getAccount()
  const next = encodeURIComponent(`/claim?token=${token}`)
  return (
    <div className="mx-auto max-w-md space-y-4">
      <Card className="space-y-3 p-5">
        <h1 className="text-2xl font-bold text-gray-900">{t('claim.heading', { name: claim.contact_name || claim.provider })}</h1>
        <p className="text-gray-700">{t('claim.text', { provider: claim.provider, brand: BRAND, n: claim.listings })}</p>
        <ul className="list-disc space-y-1 pl-5 text-sm text-gray-700">
          <li>{t('claim.benefitMessages')}</li>
          <li>{t('claim.benefitEdit')}</li>
          <li>{t('claim.benefitFree')}</li>
        </ul>
        {!account ? (
          <div className="space-y-2 pt-1">
            <LinkButton href={`/signup?next=${next}`} size="lg" block>{t('claim.signup')}</LinkButton>
            <LinkButton href={`/login?next=${next}`} variant="secondary" block>{t('claim.login')}</LinkButton>
          </div>
        ) : account.provider && !account.provider.acting ? (
          <Alert tone="warning">{t('claim.alreadyProvider')}</Alert>
        ) : (
          <ClaimButton token={token} />
        )}
      </Card>
    </div>
  )
}
