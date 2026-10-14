import { Users } from 'lucide-react'
import { JoinTeam } from '@/components/Team'
import { Alert, Card, LinkButton } from '@/components/ui'
import { requireAccount } from '@/lib/account'
import { getT } from '@/lib/i18n/server'

/** Landing page of the invitation email: join an agency's team. */
export default async function JoinPage({ searchParams }: PageProps<'/provider/join'>) {
  const token = typeof (await searchParams).token === 'string' ? ((await searchParams).token as string) : ''
  const account = await requireAccount(`/provider/join?token=${token}`)
  const { t } = await getT()
  return (
    <div className="mx-auto max-w-md pt-6">
      <Card className="space-y-4 p-6 text-center">
        <Users className="mx-auto size-10 text-brand-600" />
        <h1 className="text-xl font-extrabold">{t('team.joinTitle')}</h1>
        {account.provider ? (
          <>
            <Alert tone="warning">{t('team.alreadyProvider', { name: account.provider.display_name })}</Alert>
            <LinkButton href="/provider" variant="secondary">{t('dashboard.title')}</LinkButton>
          </>
        ) : (
          <>
            <p className="text-gray-600">{t('team.joinText')}</p>
            <JoinTeam token={token} />
          </>
        )}
      </Card>
    </div>
  )
}
