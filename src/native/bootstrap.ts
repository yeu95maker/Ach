import { App } from '@capacitor/app'
import { Browser } from '@capacitor/browser'
import { SystemBars, SystemBarsStyle } from '@capacitor/core'
import { SplashScreen } from '@capacitor/splash-screen'
import { setAuthStorage } from '@/core/authStorage'
import { parseAuthCallback } from './authCallback'
import { isNative } from './platform'
import { nativePushConfigured, onNotificationTap } from './push'
import { createSecureAuthStorage } from './secureStorage'

/**
 * Native-only setup. Runs before the first Supabase call (main.tsx) and is a
 * no-op in the browser, so the web build behaves exactly as before.
 */
export async function bootstrapNative() {
  if (!isNative()) return
  setAuthStorage(await createSecureAuthStorage())

  // Auth deep links: OAuth return and password-reset e-mails (PKCE code exchange).
  void App.addListener('appUrlOpen', async ({ url }) => {
    const cb = parseAuthCallback(url)
    if (!cb) return
    void Browser.close().catch(() => undefined)
    const [{ db }, { router }] = await Promise.all([import('@/data/client'), import('@/app/router')])
    if (cb.code) {
      const { error } = await db().auth.exchangeCodeForSession(cb.code)
      if (error) return void router.navigate('/login', { state: { authError: error.message } })
    } else if (cb.error) {
      return void router.navigate('/login', { state: { authError: cb.error } })
    }
    void router.navigate(cb.next, { replace: true })
  })

  if (nativePushConfigured) onNotificationTap((url) => void import('@/app/router').then(({ router }) => router.navigate(url)))

  // Android back button: close an open sheet first, then navigate back, then leave the app.
  void App.addListener('backButton', ({ canGoBack }) => {
    const dialog = document.querySelector<HTMLDialogElement>('dialog[open]')
    if (dialog) dialog.dispatchEvent(new Event('cancel', { cancelable: true }))
    else if (canGoBack) window.history.back()
    else void App.exitApp()
  })
}

/** Light/dark status bar icons to match the app theme. */
export function syncSystemBars(theme: 'light' | 'dark') {
  if (!isNative()) return
  void SystemBars.setStyle({ style: theme === 'dark' ? SystemBarsStyle.Dark : SystemBarsStyle.Light }).catch(() => undefined)
}

/** Hides the launch screen once React has painted the first frame. */
export function hideSplash() {
  if (!isNative()) return
  requestAnimationFrame(() => void SplashScreen.hide({ fadeOutDuration: 200 }).catch(() => undefined))
}

/** External pages (privacy policy, support): system browser on native, new tab on the web. */
export function openExternal(url: string) {
  if (isNative()) void Browser.open({ url })
  else window.open(url, '_blank', 'noopener')
}

/** OAuth on native opens the provider in the system browser (ASWebAuthenticationSession / Custom Tab). */
export async function openAuthUrl(url: string) {
  await Browser.open({ url, presentationStyle: 'popover' })
}
