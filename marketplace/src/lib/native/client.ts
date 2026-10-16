'use client'
import { Capacitor } from '@capacitor/core'

/** True inside the iOS/Android app (Capacitor), false in a normal browser. */
export function isNative(): boolean {
  return Capacitor.isNativePlatform()
}

/** Native share sheet in the app, Web Share API in browsers, clipboard as fallback. */
export async function shareLink(data: { title: string; text?: string; url: string }): Promise<'shared' | 'copied' | 'cancelled'> {
  try {
    if (isNative()) {
      const { Share } = await import('@capacitor/share')
      await Share.share({ title: data.title, text: data.text, url: data.url, dialogTitle: data.title })
      return 'shared'
    }
    if (typeof navigator.share === 'function') {
      await navigator.share(data)
      return 'shared'
    }
  } catch {
    return 'cancelled' // closed the share sheet
  }
  await navigator.clipboard?.writeText(data.url)
  return 'copied'
}

/** Current position; asks for permission. Rejects when denied or unavailable. */
export async function currentPosition(): Promise<{ lat: number; lng: number }> {
  if (isNative()) {
    const { Geolocation } = await import('@capacitor/geolocation')
    const permission = await Geolocation.checkPermissions()
    if (permission.location !== 'granted') {
      const asked = await Geolocation.requestPermissions({ permissions: ['location'] })
      if (asked.location !== 'granted') throw new Error('denied')
    }
    const pos = await Geolocation.getCurrentPosition({ timeout: 10000, enableHighAccuracy: false })
    return { lat: pos.coords.latitude, lng: pos.coords.longitude }
  }
  if (!navigator.geolocation) throw new Error('unavailable')
  return new Promise((resolve, reject) =>
    navigator.geolocation.getCurrentPosition((pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }), reject, { timeout: 10000 }),
  )
}
