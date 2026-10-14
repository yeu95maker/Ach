import { BadgeCheck, MessageCircle } from 'lucide-react'
import { PriceText } from '@/components/PriceText'
import type { Metadata } from 'next'
import Link from 'next/link'
import { EmptyState, LinkButton, PageHeader } from '@/components/ui'
import { requireAccount } from '@/lib/account'
import { formatDate, formatTime } from '@/lib/format'
import { getT } from '@/lib/i18n/server'
import { imageUrl } from '@/lib/images'
import { createClient } from '@/lib/supabase/server'
import type { ConversationSummary } from '@/lib/types'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).t('messages.title') }
}

export default async function MessagesPage() {
  await requireAccount('/messages')
  const { t, locale } = await getT()
  const supabase = await createClient()
  const { data } = await supabase.rpc('list_conversations')
  const items = (data as ConversationSummary[] | null) ?? []
  const today = new Date().toDateString()

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={t('messages.title')} subtitle={t('message.inAppOnly')} />
      {items.length === 0 ? (
        <EmptyState icon={<MessageCircle className="size-10" />} title={t('messages.emptyTitle')} text={t('messages.emptyText')} action={<LinkButton href="/search">{t('home.search')}</LinkButton>} />
      ) : (
        <ul className="divide-y divide-gray-100 overflow-hidden rounded-2xl bg-white ring-1 ring-gray-200/70">
          {items.map((c) => {
            const counterpart = c.role === 'customer' ? c.provider.name : c.customer_name
            const when = c.last_message?.created_at ?? c.last_message_at
            const cover = imageUrl(c.property.cover_image)
            return (
              <li key={c.id}>
                <Link href={`/messages/${c.id}`} className="flex gap-3 px-4 py-3.5 hover:bg-gray-50">
                  <div className="size-14 shrink-0 overflow-hidden rounded-xl bg-gray-100">{cover && <img src={cover} alt="" className="h-full w-full object-cover" />}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className={`truncate ${c.unread ? 'font-extrabold' : 'font-semibold'} text-gray-900`}>
                        {counterpart}
                        {c.role === 'customer' && c.provider.verified && <BadgeCheck className="ml-1 inline size-4 text-brand-600" aria-label={t('provider.verified')} />}
                      </p>
                      <span className="shrink-0 text-xs text-gray-500">{new Date(when).toDateString() === today ? formatTime(when, locale) : formatDate(when, locale)}</span>
                    </div>
                    <p className="truncate text-xs font-medium text-brand-700">{c.property.title} · <PriceText amount={c.property.price} currency={c.property.currency} transaction={c.property.transaction} /></p>
                    <p className={`truncate text-sm ${c.unread ? 'font-semibold text-gray-900' : 'text-gray-500'}`}>
                      {c.last_message ? `${c.last_message.mine ? `${t('messages.you')}: ` : ''}${c.last_message.body}` : t('messages.noMessages')}
                    </p>
                  </div>
                  {c.unread && <span className="mt-2 size-2.5 shrink-0 rounded-full bg-brand-600" aria-label={t('messages.unread')} />}
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
