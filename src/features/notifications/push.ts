import { config } from '@/core/config'
import { notificationRepository } from '@/data/notificationRepository'

/**
 * Web Push registration. Native apps (Capacitor) will register APNs/FCM
 * tokens through the same `register_device_token` RPC with platform ios/android.
 */
export type PushState = 'unsupported' | 'not_configured' | 'default' | 'granted' | 'denied'

export function pushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

export function currentPushState(): PushState {
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

/** Asks for permission and – if a VAPID key is configured – registers a push subscription. */
export async function enablePush(): Promise<PushState> {
  if (!pushSupported()) return 'unsupported'
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'default'
  if (!config?.vapidPublicKey) return 'granted' // in-app + system notifications while open

  const registration = await navigator.serviceWorker.register('/sw.js')
  await navigator.serviceWorker.ready
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(config.vapidPublicKey) }))
  await notificationRepository.registerWebPush(subscription.toJSON(), deviceName())
  return 'granted'
}

export async function disablePush(): Promise<void> {
  if (!pushSupported()) return
  const registration = await navigator.serviceWorker.getRegistration('/sw.js')
  const subscription = await registration?.pushManager.getSubscription()
  if (subscription) {
    await notificationRepository.unregisterDevice(subscription.endpoint)
    await subscription.unsubscribe()
  }
}
