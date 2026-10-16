import type { Metadata, Viewport } from 'next'
import Link from 'next/link'
import { BottomNav, TopNav } from '@/components/Nav'
import { NativeBridge } from '@/components/NativeBridge'
import { Toaster } from '@/components/Toaster'
import { getAccount } from '@/lib/account'
import { BRAND } from '@/lib/brand'
import { LEGAL_LINKS } from '@/lib/legal'
import { SITE_URL } from '@/lib/seo'
import { I18nProvider } from '@/lib/i18n/client'
import { getT } from '@/lib/i18n/server'
import './globals.css'

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT()
  return {
    metadataBase: new URL(SITE_URL),
    title: { default: `${BRAND} – ${t('meta.tagline')}`, template: `%s · ${BRAND}` },
    description: t('meta.description'),
    applicationName: BRAND,
    openGraph: { siteName: BRAND, type: 'website' },
  }
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#12805e',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { locale, t } = await getT()
  const account = await getAccount()
  const nav = {
    unreadMessages: account?.unread_messages ?? 0,
    unreadNotifications: account?.unread_notifications ?? 0,
    canAddProperty: account?.provider?.status === 'verified',
  }
  return (
    <html lang={locale}>
      <body className="min-h-dvh font-sans antialiased">
        <I18nProvider locale={locale}>
          <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2">
            {t('nav.skip')}
          </a>
          <header className="sticky top-0 z-30 border-b border-gray-200/80 bg-white/90 backdrop-blur">
            <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
              <Link href="/" className="flex items-center gap-2 text-lg font-extrabold tracking-tight text-brand-800">
                <span aria-hidden className="flex size-8 items-center justify-center rounded-lg bg-brand-600 text-white">⌂</span>
                {BRAND}
              </Link>
              <TopNav {...nav} />
              {!account && (
                <Link href="/login" className="text-sm font-semibold text-brand-700 md:ml-3">
                  {t('auth.signIn')}
                </Link>
              )}
            </div>
          </header>
          <main id="main" className="mx-auto max-w-6xl px-4 pt-4 pb-28 md:pb-12">
            {children}
            <footer className="mt-12 border-t border-gray-200 pt-4 text-sm text-gray-500">
              <nav aria-label={t('legal.support')} className="flex flex-wrap gap-x-4 gap-y-2">
                {LEGAL_LINKS.map((l) => <Link key={l.href} href={l.href} className="hover:text-brand-700">{t(l.key)}</Link>)}
              </nav>
              <p className="mt-2">© {new Date().getFullYear()} {BRAND}</p>
            </footer>
          </main>
          <BottomNav {...nav} />
          <Toaster />
          <NativeBridge />
        </I18nProvider>
      </body>
    </html>
  )
}
