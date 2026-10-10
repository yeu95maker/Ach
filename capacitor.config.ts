import type { CapacitorConfig } from '@capacitor/cli'

/**
 * Native shells for iOS and Android around the same web build (`dist`).
 * Build with `npm run build:native` (BASE_PATH=/), then `npx cap sync`.
 *
 * appId is the permanent bundle / package identifier in both stores –
 * change it to your own reverse domain BEFORE the first upload
 * (docs/APP-STORES.md → "Vor dem ersten Upload").
 */
const config: CapacitorConfig = {
  appId: 'dev.shiftcare.app',
  appName: 'ShiftCare',
  webDir: 'dist',
  // Origins seen by Supabase: capacitor://localhost (iOS), https://localhost (Android).
  server: { androidScheme: 'https' },
  ios: { contentInset: 'never', limitsNavigationsToAppBoundDomains: false },
  android: { allowMixedContent: false },
  plugins: {
    SplashScreen: { launchShowDuration: 0, launchAutoHide: false, backgroundColor: '#0F3D91', showSpinner: false },
    PushNotifications: { presentationOptions: ['badge', 'sound', 'alert'] },
  },
}

export default config
