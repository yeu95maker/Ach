import { PushNotifications, type Token } from '@capacitor/push-notifications'
import { nativePlatform } from './platform'

/**
 * Native push needs provider setup that cannot live in the repository
 * (GoogleService-Info / google-services.json, APNs key). Builds opt in with
 * VITE_NATIVE_PUSH=true once that is done – without google-services.json,
 * PushNotifications.register() crashes the Android app.
 */
export const nativePushConfigured = import.meta.env.VITE_NATIVE_PUSH === 'true'

const PREF_KEY = 'shiftcare.push.native'
const TOKEN_KEY = 'shiftcare.push.token'

const read = (k: string) => {
  try {
    return localStorage.getItem(k)
  } catch {
    return null
  }
}
const write = (k: string, v: string | null) => {
  try {
    if (v === null) localStorage.removeItem(k)
    else localStorage.setItem(k, v)
  } catch {
    /* ignore */
  }
}

export type NativePermission = 'granted' | 'denied' | 'prompt'

export async function nativePermission(): Promise<NativePermission> {
  const { receive } = await PushNotifications.checkPermissions()
  return receive === 'granted' ? 'granted' : receive === 'denied' ? 'denied' : 'prompt'
}

export const nativePushWanted = () => read(PREF_KEY) === 'on'
export const lastNativeToken = () => read(TOKEN_KEY)

/** Registers with APNs/FCM and resolves with the device token. */
function registerForToken(): Promise<string> {
  return new Promise((resolve, reject) => {
    const handles = [
      PushNotifications.addListener('registration', (t: Token) => {
        void Promise.all(handles).then((hs) => hs.forEach((h) => void h.remove()))
        resolve(t.value)
      }),
      PushNotifications.addListener('registrationError', (e) => {
        void Promise.all(handles).then((hs) => hs.forEach((h) => void h.remove()))
        reject(new Error(e.error))
      }),
    ]
    void PushNotifications.register().catch(reject)
  })
}

/**
 * Asks for permission (once), registers and hands the token to `save`.
 * Returns the resulting permission.
 */
export async function enableNativePush(save: (platform: 'ios' | 'android', token: string) => Promise<void>): Promise<NativePermission> {
  const platform = nativePlatform()
  if (!platform || !nativePushConfigured) return 'denied'
  let perm = await nativePermission()
  if (perm === 'prompt') perm = (await PushNotifications.requestPermissions()).receive === 'granted' ? 'granted' : 'denied'
  if (perm !== 'granted') return perm
  const token = await registerForToken()
  await save(platform, token)
  write(PREF_KEY, 'on')
  write(TOKEN_KEY, token)
  return 'granted'
}

export async function disableNativePush(remove: (token: string) => Promise<void>) {
  const token = lastNativeToken()
  write(PREF_KEY, null)
  write(TOKEN_KEY, null)
  if (token) await remove(token)
  await PushNotifications.unregister().catch(() => undefined)
}

/** Tokens rotate: re-register on every app start while push is switched on. */
export async function refreshNativePush(save: (platform: 'ios' | 'android', token: string) => Promise<void>) {
  if (!nativePlatform() || !nativePushConfigured || !nativePushWanted()) return
  if ((await nativePermission()) !== 'granted') return
  await enableNativePush(save)
}

/** Tapping a notification opens its page (payload `url`, see push-dispatch). */
export function onNotificationTap(navigate: (url: string) => void) {
  void PushNotifications.addListener('pushNotificationActionPerformed', ({ notification }) => {
    const url = (notification.data as { url?: unknown } | undefined)?.url
    if (typeof url === 'string' && url.startsWith('/') && !url.startsWith('//')) navigate(url)
  })
}
