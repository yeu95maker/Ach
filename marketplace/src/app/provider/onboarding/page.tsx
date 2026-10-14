import { BadgeCheck, Clock } from 'lucide-react'
import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { REFERRAL_COOKIE } from '@/lib/referral'
import { OnboardingShell, ProviderProfileForm, VerificationForm, type OwnProvider } from '@/components/ProviderOnboarding'
import { Alert, LinkButton, PageHeader } from '@/components/ui'
import { requireAccount } from '@/lib/account'
import { getT } from '@/lib/i18n/server'
import { createClient } from '@/lib/supabase/server'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).t('onboarding.title') }
}

export default async function OnboardingPage() {
  const account = await requireAccount('/provider/onboarding')
  // Team members (agents/admins) work for someone else's provider account – verification is the owner's job.
  if (account.provider && account.provider.role !== 'owner') redirect('/provider')
  const { t } = await getT()
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data } = await supabase.from('providers').select('id, display_name, provider_type, country, city, about, status, status_note').eq('owner_id', account.id).maybeSingle()
  const provider = data as OwnProvider | null

  const step = !provider ? 0 : provider.status === 'verified' ? 3 : provider.status === 'pending' ? 2 : 1
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={t('onboarding.title')} subtitle={t('onboarding.subtitle')} />
      <OnboardingShell step={step}>
        {!provider && (
          <>
            <h2 className="mb-1 text-lg font-bold">{t('onboarding.step1')}</h2>
            <p className="mb-4 text-sm text-gray-600">{t('onboarding.step1Text')}</p>
            <ProviderProfileForm provider={null} userId={account.id} referralCode={(await cookies()).get(REFERRAL_COOKIE)?.value ?? ''} />
          </>
        )}
        {provider && (provider.status === 'unverified' || provider.status === 'rejected') && (
          <>
            <h2 className="mb-1 text-lg font-bold">{t('onboarding.step2')}</h2>
            <p className="mb-4 text-sm text-gray-600">{t('onboarding.step2Text')}</p>
            {provider.status === 'rejected' && <Alert tone="error" className="mb-4">{t('onboarding.rejected')} {provider.status_note}</Alert>}
            <VerificationForm provider={provider} userId={account.id} email={user?.email ?? ''} />
          </>
        )}
        {provider?.status === 'pending' && (
          <div className="text-center">
            <Clock className="mx-auto size-10 text-gold-500" />
            <h2 className="mt-2 text-lg font-bold">{t('onboarding.pendingTitle')}</h2>
            <p className="mt-1 text-sm text-gray-600">{t('onboarding.pendingText')}</p>
            <LinkButton href="/provider/properties/new" variant="secondary" className="mt-4">{t('onboarding.prepareDraft')}</LinkButton>
          </div>
        )}
        {provider?.status === 'verified' && (
          <div className="text-center">
            <BadgeCheck className="mx-auto size-10 text-brand-600" />
            <h2 className="mt-2 text-lg font-bold">{t('onboarding.verifiedTitle')}</h2>
            <p className="mt-1 text-sm text-gray-600">{t('provider.verifiedMeaning')}</p>
            <LinkButton href="/provider/properties/new" className="mt-4">+ {t('nav.addProperty')}</LinkButton>
          </div>
        )}
        {provider?.status === 'suspended' && <Alert tone="error">{t('onboarding.suspended')} {provider.status_note}</Alert>}
      </OnboardingShell>
      {provider && provider.status !== 'suspended' && (
        <details className="mt-5 rounded-2xl bg-white p-5 ring-1 ring-gray-200">
          <summary className="cursor-pointer font-semibold">{t('onboarding.editProfile')}</summary>
          <div className="mt-4"><ProviderProfileForm provider={provider} userId={account.id} /></div>
        </details>
      )}
    </div>
  )
}
