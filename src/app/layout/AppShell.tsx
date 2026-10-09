import { useQuery } from '@tanstack/react-query'
import { HeartPulse, Palmtree } from 'lucide-react'
import { Suspense } from 'react'
import { useTranslation } from 'react-i18next'
import { NavLink, Outlet, useLocation } from 'react-router'
import { PersonAvatar } from '@/components/PersonAvatar'
import { countUnreadNotifications } from '@/data/notificationRepository'
import { useRealtimeNotifications } from '@/features/notifications/useRealtimeNotifications'
import { queryKeys } from '@/features/queryKeys'
import { useCurrentUser, useEmployment } from '@/features/tenant/TenantProvider'
import { ButtonLink, CountBadge, Spinner, cn } from '@/ui'
import { Logo, LogoMark } from './Logo'
import { NAV_ITEMS } from './navItems'

function useUnreadCount() {
  const user = useCurrentUser()
  return useQuery({
    queryKey: [...queryKeys.notifications(user.id), 'unread'],
    queryFn: countUnreadNotifications,
    staleTime: 30_000,
  }).data ?? 0
}

/**
 * Responsive application frame
 *   phone   (< md): content + floating bottom tab bar
 *   tablet  (md–lg): icon rail
 *   desktop (≥ lg): full sidebar with quick actions
 */
export function AppShell() {
  const { t } = useTranslation()
  const user = useCurrentUser()
  const employment = useEmployment()
  const unread = useUnreadCount()
  const location = useLocation()
  useRealtimeNotifications()

  return (
    <div className="min-h-dvh md:flex">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-xl focus:bg-surface focus:px-4 focus:py-2">
        {t('nav.skipToContent')}
      </a>

      {/* Sidebar / rail */}
      <aside className="sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-border/70 bg-surface/60 backdrop-blur-xl md:flex md:w-[88px] lg:w-[272px]">
        <div className="flex h-20 items-center px-6 max-lg:justify-center max-lg:px-0">
          <Logo className="hidden lg:flex" />
          <LogoMark className="lg:hidden" />
        </div>

        <div className="mx-4 mb-4 hidden rounded-2xl bg-surface-2 px-4 py-3 lg:block">
          <p className="truncate text-sm font-semibold text-text">{employment.hospital.name}</p>
          <p className="truncate text-[13px] text-text-3">{employment.units.find((u) => u.isPrimary)?.name ?? employment.jobTitle}</p>
        </div>

        <nav aria-label={t('nav.main')} className="flex flex-1 flex-col gap-1 px-3">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                cn(
                  'group relative flex h-12 items-center gap-3 rounded-xl px-3 text-[15px] font-medium transition-colors duration-150',
                  'max-lg:h-14 max-lg:flex-col max-lg:justify-center max-lg:gap-1 max-lg:px-0 max-lg:text-[11px]',
                  isActive ? 'bg-primary-soft text-primary-text' : 'text-text-2 hover:bg-surface-2 hover:text-text',
                )
              }
            >
              <span className="relative">
                <item.icon className="size-[22px]" strokeWidth={1.9} aria-hidden />
                {item.badge === 'unread' && <CountBadge count={unread} className="absolute -top-2 -right-2.5 lg:hidden" />}
              </span>
              <span>{t(item.labelKey)}</span>
              {item.badge === 'unread' && <CountBadge count={unread} className="ml-auto hidden lg:inline-flex" />}
            </NavLink>
          ))}
        </nav>

        <div className="hidden space-y-2 px-4 pb-4 lg:block">
          <ButtonLink to="/requests/sick/new" variant="secondary" fullWidth icon={<HeartPulse className="size-[18px] text-danger" />}>
            {t('actions.reportSick')}
          </ButtonLink>
          <ButtonLink to="/requests/leave/new" variant="secondary" fullWidth icon={<Palmtree className="size-[18px] text-accent" />}>
            {t('actions.requestLeave')}
          </ButtonLink>
        </div>

        <NavLink
          to="/profile"
          className="mx-3 mb-4 flex items-center gap-3 rounded-2xl p-2 transition-colors hover:bg-surface-2 max-lg:justify-center"
        >
          <PersonAvatar person={user} size="md" />
          <span className="hidden min-w-0 lg:block">
            <span className="block truncate text-sm font-semibold">{`${user.firstName} ${user.lastName}`}</span>
            <span className="block truncate text-[13px] text-text-3">{employment.jobTitle}</span>
          </span>
        </NavLink>
      </aside>

      {/* Content */}
      <main id="main" className="min-w-0 flex-1 pb-[calc(6.5rem+env(safe-area-inset-bottom))] md:pb-12">
        <div key={location.pathname} className="mx-auto w-full max-w-6xl animate-fade-in px-4 pt-[max(1.5rem,env(safe-area-inset-top))] sm:px-6 md:pt-10 lg:px-10">
          <Suspense
            fallback={
              <div className="flex justify-center py-24 text-text-3">
                <Spinner />
              </div>
            }
          >
            <Outlet />
          </Suspense>
        </div>
      </main>

      {/* Bottom tab bar (phones) */}
      <nav
        aria-label={t('nav.main')}
        className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 rounded-[26px] border border-border/70 bg-surface/85 shadow-lg backdrop-blur-2xl backdrop-saturate-150 md:hidden"
      >
        <ul className="grid grid-cols-5">
          {NAV_ITEMS.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  cn(
                    'flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors duration-150 active:scale-95',
                    isActive ? 'text-primary-text' : 'text-text-3',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <span className="relative">
                      <span
                        className={cn(
                          'absolute -inset-x-3.5 -inset-y-1 rounded-full bg-primary-soft transition-[opacity,transform] duration-200',
                          isActive ? 'scale-100 opacity-100' : 'scale-75 opacity-0',
                        )}
                        aria-hidden
                      />
                      <item.icon className="relative size-[22px]" strokeWidth={isActive ? 2.2 : 1.9} aria-hidden />
                      {item.badge === 'unread' && <CountBadge count={unread} className="absolute -top-1.5 -right-3" />}
                    </span>
                    <span className="max-w-full truncate px-1">{t(item.labelKey)}</span>
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}
