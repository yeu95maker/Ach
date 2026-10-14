import { Bell, Building2, ChevronRight, Crown, Shield } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { PrivacyActions } from '@/components/PrivacyActions'
import { ProfileForm, SignOutButton } from '@/components/ProfileForms'
import { Badge, Card, PageHeader } from '@/components/ui'
import { requireAccount } from '@/lib/account'
import { formatDate } from '@/lib/format'
import { getT } from '@/lib/i18n/server'
import { createClient } from '@/lib/supabase/server'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).t('nav.profile') }
}

function Row({ href, icon, title, text, badge }: { href: string; icon: React.ReactNode; title: string; text?: string; badge?: React.ReactNode }) {
  return (
    <Link href={href} className="flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50">
      <span className="text-brand-700">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-gray-900">{title}</span>
        {text && <span className="block truncate text-sm text-gray-500">{text}</span>}
      </span>
      {badge}
      <ChevronRight className="size-5 text-gray-400" />
    </Link>
  )
}

export default async function ProfilePage() {
  const account = await requireAccount('/profile')
  const { t, locale } = await getT()
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const m = account.membership
  const membershipText = account.is_premium && m
    ? t(!m.auto_renew ? 'membership.validUntil' : m.cancel_at_period_end ? 'membership.endsOn' : 'membership.renewsOn', { date: formatDate(m.current_period_end, locale) })
    : t('membership.freePlan')

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <PageHeader title={account.full_name || t('nav.profile')} subtitle={user?.email} />

      <Card className="divide-y divide-gray-100 overflow-hidden">
        <Row href="/membership" icon={<Crown className="size-5" />} title={account.is_premium ? t('premium.name') : t('membership.free')} text={membershipText}
          badge={account.is_premium ? <Badge tone="gold">{t('premium.name')}</Badge> : <Badge tone="gray">{t('premium.upgrade')}</Badge>} />
        <Row href="/notifications" icon={<Bell className="size-5" />} title={t('notifications.title')}
          badge={account.unread_notifications > 0 ? <Badge tone="red">{account.unread_notifications}</Badge> : undefined} />
        {account.provider ? (
          <Row href="/provider" icon={<Building2 className="size-5" />} title={t('dashboard.title')} text={`${account.provider.display_name} · ${t(`providerStatus.${account.provider.status}`)}`} />
        ) : (
          <Row href="/provider/onboarding" icon={<Building2 className="size-5" />} title={t('home.sellCta')} text={t('profile.becomeProvider')} />
        )}
        {account.is_admin && <Row href="/admin" icon={<Shield className="size-5" />} title={t('admin.title')} />}
      </Card>

      <Card className="p-5">
        <h2 className="mb-4 font-bold text-gray-900">{t('profile.settings')}</h2>
        <ProfileForm userId={account.id} fullName={account.full_name} emailNotifications={account.email_notifications} />
      </Card>

      <Card className="p-5">
        <h2 className="mb-3 font-bold text-gray-900">{t('privacy.title')}</h2>
        <PrivacyActions />
      </Card>

      <SignOutButton />
    </div>
  )
}
