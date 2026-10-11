import type { Metadata } from 'next'
import { AuthForm } from '@/components/AuthForm'
import { Card } from '@/components/ui'
import { getT } from '@/lib/i18n/server'
import { safeNext } from '@/lib/next'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).t('auth.signUp') }
}

export default async function SignupPage({ searchParams }: PageProps<'/signup'>) {
  const { t } = await getT()
  const params = await searchParams
  const provider = params.intent === 'provider'
  const next = safeNext(params.next, provider ? '/provider/onboarding' : '/')
  return (
    <div className="mx-auto max-w-sm pt-6">
      <h1 className="mb-1 text-2xl font-extrabold text-gray-900">{t(provider ? 'auth.signupProviderTitle' : 'auth.signupTitle')}</h1>
      <p className="mb-5 text-gray-600">{t(provider ? 'auth.signupProviderText' : 'auth.signupText')}</p>
      <Card className="p-5"><AuthForm mode="signup" next={next} /></Card>
    </div>
  )
}
