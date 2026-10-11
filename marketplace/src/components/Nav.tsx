'use client'
import clsx from 'clsx'
import { Heart, Home, MessageCircle, Plus, Search, User } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useI18n } from '@/lib/i18n/client'
import type { MessageKey } from '@/lib/i18n'

interface NavProps {
  unreadMessages: number
  unreadNotifications: number
  canAddProperty: boolean
}

const ITEMS: { href: string; label: MessageKey; icon: typeof Home; badge?: 'messages' | 'notifications' }[] = [
  { href: '/', label: 'nav.home', icon: Home },
  { href: '/search', label: 'nav.search', icon: Search },
  { href: '/saved', label: 'nav.saved', icon: Heart },
  { href: '/messages', label: 'nav.messages', icon: MessageCircle, badge: 'messages' },
  { href: '/profile', label: 'nav.profile', icon: User, badge: 'notifications' },
]

function isActive(pathname: string, href: string) {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`)
}

function Count({ n }: { n: number }) {
  if (n <= 0) return null
  return (
    <span className="absolute -top-1.5 left-1/2 ml-1.5 min-w-4.5 rounded-full bg-red-600 px-1 text-center text-[10px] leading-4.5 font-bold text-white">
      {n > 9 ? '9+' : n}
    </span>
  )
}

/** Mobile: fixed bottom bar. Verified providers get the extra "Add property" action in the middle. */
export function BottomNav({ unreadMessages, unreadNotifications, canAddProperty }: NavProps) {
  const pathname = usePathname()
  const { t } = useI18n()
  const items = [...ITEMS]
  const counts = { messages: unreadMessages, notifications: unreadNotifications }
  return (
    <nav aria-label={t('nav.main')} className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white/95 backdrop-blur md:hidden">
      <ul className="mx-auto flex max-w-lg items-stretch justify-around px-1 pt-1.5">
        {items.map((item, i) => {
          const Icon = item.icon
          const active = isActive(pathname, item.href)
          return (
            <li key={item.href} className="contents">
              {canAddProperty && i === 2 && (
                <Link href="/provider/properties/new" aria-label={t('nav.addProperty')} className="-mt-5 flex flex-col items-center">
                  <span className="flex size-12 items-center justify-center rounded-full bg-brand-600 text-white shadow-lg ring-4 ring-white">
                    <Plus className="size-6" />
                  </span>
                </Link>
              )}
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={clsx('relative flex min-w-14 flex-col items-center gap-0.5 px-1 py-1 text-[11px] font-medium', active ? 'text-brand-700' : 'text-gray-500')}
              >
                <span className="relative">
                  <Icon className={clsx('size-6', active && 'fill-brand-100')} strokeWidth={active ? 2.2 : 1.8} />
                  {item.badge && <Count n={counts[item.badge]} />}
                </span>
                {t(item.label)}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

/** Desktop: links in the header. */
export function TopNav({ unreadMessages, unreadNotifications, canAddProperty }: NavProps) {
  const pathname = usePathname()
  const { t } = useI18n()
  const counts = { messages: unreadMessages, notifications: unreadNotifications }
  return (
    <nav aria-label={t('nav.main')} className="hidden items-center gap-1 md:flex">
      {ITEMS.map((item) => {
        const active = isActive(pathname, item.href)
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={clsx('relative rounded-lg px-3 py-2 text-sm font-medium', active ? 'bg-brand-50 text-brand-700' : 'text-gray-600 hover:bg-gray-100')}
          >
            {t(item.label)}
            {item.badge && counts[item.badge] > 0 && (
              <span className="ml-1.5 rounded-full bg-red-600 px-1.5 text-[11px] font-bold text-white">{counts[item.badge]}</span>
            )}
          </Link>
        )
      })}
      {canAddProperty && (
        <Link href="/provider/properties/new" className="ml-2 inline-flex h-9 items-center gap-1 rounded-xl bg-brand-600 px-3 text-sm font-semibold text-white hover:bg-brand-700">
          <Plus className="size-4" /> {t('nav.addProperty')}
        </Link>
      )}
    </nav>
  )
}
