import { config } from '@/core/config'
import { notificationRepository } from '@/data/notificationRepository'
import { isNative } from '@/native/platform'
import { disableNativePush, enableNativePush, nativePermission, nativePushConfigured, nativePushWanted, refreshNativePush } from '@/native/push'

/**
 * Push registration. Web: Web Push (VAPID) via the service worker.
 * iOS/Android: APNs/FCM tokens via src/native/push.ts. Both end up in
 * `register_device_token` and are delivered by the push-dispatch function.
 */
export type PushState = 'unsupported' | 'not_configured' | 'default' | 'granted' | 'denied'

const saveNative = (platform: 'ios' | 'android', token: string) => notificationRepository.registerNativeToken(platform, token, platform === 'ios' ? 'iOS App' : 'Android App')

export function pushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

/** Synchronous first guess; native apps refine it with `loadPushState()`. */
export function currentPushState(): PushState {
  if (isNative()) return nativePushConfigured ? 'default' : 'not_configured'
  if (!pushSupported()) return 'unsupported'
  if (!config?.vapidPublicKey) return Notification.permission === 'granted' ? 'granted' : Notification.permission === 'denied' ? 'denied' : 'default'
  return Notification.permission === 'default' ? 'default' : Notification.permission
}

function urlBase64ToUint8Array(base64: string) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

function deviceName() {
  const ua = navigator.userAgent
  if (/iPhone|iPad/.test(ua)) return 'iOS Browser'
  if (/Android/.test(ua)) return 'Android Browser'
  if (/Mac/.test(ua)) return 'Mac Browser'
  if (/Windows/.test(ua)) return 'Windows Browser'
  return 'Web Browser'
}

export async function loadPushState(): Promise<PushState> {
  if (!isNative()) return currentPushState()
  if (!nativePushConfigured) return 'not_configured'
  const perm = await nativePermission()
  if (perm === 'denied') return 'denied'
  return perm === 'granted' && nativePushWanted() ? 'granted' : 'default'
}

/** Called once per signed-in app start: keeps a rotated native token up to date. */
export function refreshPushRegistration() {
  if (isNative()) void refreshNativePush(saveNative).catch(() => undefined)
}

/** Asks for permission and – if a VAPID key is configured – registers a push subscription. */
export async function enablePush(): Promise<PushState> {
  if (isNative()) {
    const perm = await enableNativePush(saveNative)
    return perm === 'granted' ? 'granted' : perm === 'denied' ? 'denied' : 'default'
  }
  if (!pushSupported()) return 'unsupported'
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'default'
  if (!config?.vapidPublicKey) return 'granted' // in-app + system notifications while open

  const registration = await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`)
  await navigator.serviceWorker.ready
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(config.vapidPublicKey) }))
  await notificationRepository.registerWebPush(subscription.toJSON(), deviceName())
  return 'granted'
}

export async function disablePush(): Promise<void> {
  if (isNative()) return disableNativePush((token) => notificationRepository.unregisterDevice(token))
  if (!pushSupported()) return
  const registration = await navigator.serviceWorker.getRegistration(`${import.meta.env.BASE_URL}sw.js`)
  const subscription = await registration?.pushManager.getSubscription()
  if (subscription) {
    await notificationRepository.unregisterDevice(subscription.endpoint)
    await subscription.unsubscribe()
  }
}
