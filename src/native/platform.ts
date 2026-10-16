import { Capacitor } from '@capacitor/core'

export type NativePlatform = 'ios' | 'android'

/** 'ios' | 'android' inside the Capacitor shell, otherwise null (browser / PWA). */
export function nativePlatform(): NativePlatform | null {
  const p = Capacitor.getPlatform()
  return p === 'ios' || p === 'android' ? p : null
}

export const isNative = () => nativePlatform() !== null

/** Custom URL scheme registered in Info.plist and AndroidManifest.xml. */
export const AUTH_CALLBACK = 'dienstwerk://auth-callback'
