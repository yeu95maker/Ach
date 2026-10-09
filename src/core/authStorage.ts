/**
 * Pluggable storage for the Supabase auth session.
 *
 * Web: localStorage. Native (Capacitor, later): swap in an adapter backed by
 * the iOS Keychain / Android Keystore and gate `getItem` behind a biometric
 * prompt (Face ID / Touch ID / fingerprint). Nothing else in the app has to
 * change – see docs/ARCHITECTURE.md → "Biometric login".
 */
export interface AuthStorage {
  getItem(key: string): string | null | Promise<string | null>
  setItem(key: string, value: string): void | Promise<void>
  removeItem(key: string): void | Promise<void>
}

export const browserAuthStorage: AuthStorage = {
  getItem: (key) => {
    try {
      return window.localStorage.getItem(key)
    } catch {
      return null
    }
  },
  setItem: (key, value) => {
    try {
      window.localStorage.setItem(key, value)
    } catch {
      /* storage unavailable (private mode) – session lives in memory only */
    }
  },
  removeItem: (key) => {
    try {
      window.localStorage.removeItem(key)
    } catch {
      /* ignore */
    }
  },
}

let activeStorage: AuthStorage = browserAuthStorage

/** Must be called before the Supabase client is first used. */
export function setAuthStorage(storage: AuthStorage) {
  activeStorage = storage
}

export const authStorage: AuthStorage = {
  getItem: (key) => activeStorage.getItem(key),
  setItem: (key, value) => activeStorage.setItem(key, value),
  removeItem: (key) => activeStorage.removeItem(key),
}
