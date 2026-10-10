import { KeychainAccess, SecureStorage } from '@aparajita/capacitor-secure-storage'
import type { AuthStorage } from '@/core/authStorage'

/**
 * Supabase session storage backed by the iOS Keychain / Android Keystore.
 * Items stay on this device only (no iCloud sync, not restored to other devices).
 */
export async function createSecureAuthStorage(): Promise<AuthStorage> {
  await SecureStorage.setKeyPrefix('shiftcare_')
  await SecureStorage.setSynchronize(false)
  await SecureStorage.setDefaultKeychainAccess(KeychainAccess.whenUnlockedThisDeviceOnly)
  return {
    getItem: (key) => SecureStorage.getItem(key),
    setItem: (key, value) => SecureStorage.setItem(key, value),
    removeItem: (key) => SecureStorage.removeItem(key),
  }
}
