'use client'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { isNative } from '@/lib/native/client'

/**
 * Glue for the iOS/Android app (no-op in browsers): hides the splash screen,
 * styles the status bar, handles the Android back button, opens deep links
 * (https://<site>/properties/… tapped in mail or chat apps) inside the app and
 * opens links to other websites in the in-app browser.
 */
export function NativeBridge() {
  const router = useRouter()

  useEffect(() => {
    if (!isNative()) return
    document.documentElement.classList.add('native-app')
    const cleanups: (() => void)[] = []
    let cancelled = false

    void (async () => {
      const [{ App }, { Browser }, { SplashScreen }, { StatusBar, Style }] = await Promise.all([
        import('@capacitor/app'),
        import('@capacitor/browser'),
        import('@capacitor/splash-screen'),
        import('@capacitor/status-bar'),
      ])
      if (cancelled) return
      await SplashScreen.hide().catch(() => {})
      await StatusBar.setStyle({ style: Style.Light }).catch(() => {})

      const back = await App.addListener('backButton', ({ canGoBack }) => {
        if (canGoBack) window.history.back()
        else void App.exitApp()
      })
      const deepLink = await App.addListener('appUrlOpen', ({ url }) => {
        try {
          const target = new URL(url)
          if (target.host === window.location.host) router.push(`${target.pathname}${target.search}${target.hash}`)
        } catch {
          /* not a URL we handle */
        }
      })
      cleanups.push(() => void back.remove(), () => void deepLink.remove())

      const onClick = (event: MouseEvent) => {
        const anchor = (event.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null
        if (!anchor || event.defaultPrevented) return
        const href = anchor.href
        if (!/^https?:/i.test(href)) return // tel:, mailto: … are handled by the system
        if (new URL(href).host === window.location.host) return
        event.preventDefault()
        void Browser.open({ url: href })
      }
      document.addEventListener('click', onClick)
      cleanups.push(() => document.removeEventListener('click', onClick))
    })()

    return () => {
      cancelled = true
      cleanups.forEach((fn) => fn())
    }
  }, [router])

  return null
}
