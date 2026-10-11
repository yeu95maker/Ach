import { Bell } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { MarkAllRead } from '@/components/ProfileForms'
import { EmptyState, PageHeader } from '@/components/ui'
import { requireAccount } from '@/lib/account'
import { formatDate } from '@/lib/format'
import type { MessageKey } from '@/lib/i18n'
import { getT } from '@/lib/i18n/server'
import { createClient } from '@/lib/supabase/server'
import type { Notification } from '@/lib/types'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).t('notifications.title') }
}

export default async function NotificationsPage() {
  await requireAccount('/notifications')
  const { t, locale } = await getT()
  const supabase = await createClient()
  const { data } = await supabase.from('notifications').select('id, kind, title, body, link, read_at, created_at').order('created_at', { ascending: false }).limit(100)
  const items = (data as Notification[] | null) ?? []

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={t('notifications.title')} action={items.some((n) => !n.read_at) ? <MarkAllRead /> : undefined} />
      {items.length === 0 ? (
        <EmptyState icon={<Bell className="size-10" />} title={t('notifications.empty')} />
      ) : (
        <ul className="divide-y divide-gray-100 overflow-hidden rounded-2xl bg-white ring-1 ring-gray-200/70">
          {items.map((n) => {
            const key = `notification.${n.kind}` as MessageKey
            const content = (
              <div className="flex gap-3 px-4 py-3.5">
                <span className={`mt-1.5 size-2.5 shrink-0 rounded-full ${n.read_at ? 'bg-transparent' : 'bg-brand-600'}`} />
                <div className="min-w-0">
                  <p className="font-semibold text-gray-900">{t(key, { title: n.title, body: n.body })}</p>
                  {n.body && !['membership', 'favorite_unavailable', 'favorite_price_drop'].includes(n.kind) && <p className="text-sm text-gray-600">{n.body}</p>}
                  <p className="mt-0.5 text-xs text-gray-400">{formatDate(n.created_at, locale)}</p>
                </div>
              </div>
            )
            return <li key={n.id}>{n.link ? <Link href={n.link} className="block hover:bg-gray-50">{content}</Link> : content}</li>
          })}
        </ul>
      )}
    </div>
  )
}
