import { CalendarCheck2, ShieldCheck, UsersRound } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Logo, LogoMark } from '@/app/layout/Logo'

export function AuthLayout({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  const { t } = useTranslation()
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      {/* Brand panel */}
      <section className="relative hidden overflow-hidden bg-[#0B2A66] p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div
          className="pointer-events-none absolute inset-0 opacity-90"
          style={{
            background:
              'radial-gradient(60% 50% at 85% 10%, rgba(24,183,176,0.45) 0%, transparent 70%), radial-gradient(70% 60% at 0% 100%, rgba(61,116,232,0.55) 0%, transparent 70%)',
          }}
          aria-hidden
        />
        <div className="relative flex items-center gap-3">
          <LogoMark className="size-10" />
          <span className="text-xl font-bold tracking-tight">
            Shift<span className="text-[#5FE0D9]">Care</span>
          </span>
        </div>
        <div className="relative max-w-md">
          <h2 className="text-4xl leading-tight font-bold tracking-tight">{t('auth.brandTitle')}</h2>
          <p className="mt-4 text-lg text-white/75">{t('auth.brandSubtitle')}</p>
          <ul className="mt-10 space-y-4 text-white/90">
            {[
              { icon: CalendarCheck2, text: t('auth.brandPoint1') },
              { icon: UsersRound, text: t('auth.brandPoint2') },
              { icon: ShieldCheck, text: t('auth.brandPoint3') },
            ].map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-xl bg-white/10 backdrop-blur">
                  <Icon className="size-5" aria-hidden />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-sm text-white/50">© {new Date().getFullYear()} Pulshift</p>
      </section>

      {/* Form */}
      <main className="flex items-center justify-center px-5 py-10 sm:px-8">
        <div className="w-full max-w-[420px] animate-rise">
          <Logo className="mb-10 lg:hidden" />
          <h1 className="text-[30px] leading-tight font-bold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-2 text-[15px] text-text-2">{subtitle}</p>}
          <div className="mt-8">{children}</div>
        </div>
      </main>
    </div>
  )
}
