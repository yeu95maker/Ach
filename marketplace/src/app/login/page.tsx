import type { Metadata } from 'next'
import { AuthForm } from '@/components/AuthForm'
import { Card } from '@/components/ui'
import { getT } from '@/lib/i18n/server'
import { safeNext } from '@/lib/next'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).t('auth.signIn') }
}

export default async function LoginPage({ searchParams }: PageProps<'/login'>) {
  const { t } = await getT()
  const next = safeNext((await searchParams).next)
  return (
    <div className="mx-auto max-w-sm pt-6">
      <h1 className="mb-1 text-2xl font-extrabold text-gray-900">{t('auth.welcomeBack')}</h1>
      <p className="mb-5 text-gray-600">{t('auth.loginText')}</p>
      <Card className="p-5"><AuthForm mode="login" next={next} /></Card>
    </div>
  )
}
