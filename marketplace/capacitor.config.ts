import type { CapacitorConfig } from '@capacitor/cli'

/**
 * iOS and Android apps for StandFinder (store guide: docs/APP-STORES.md).
 *
 * The apps load the live website (server-rendered Next.js) from APP_URL and add
 * native features on top (src/components/NativeBridge.tsx, src/lib/native):
 * share sheet, location for "Near me", universal/app links, in-app browser,
 * Android back button, splash screen and status bar. mobile/www is only the
 * offline screen shown when the site cannot be reached.
 *
 * APP_URL must be set when running `npx cap sync` (the release workflow does).
 * appId is permanent once uploaded – change it before the first upload if needed,
 * together with NATIVE_APP_ID in src/lib/native/index.ts.
 */
const appUrl = (process.env.APP_URL || 'https://property-finder-drab-omega.vercel.app').replace(/\/$/, '')

const config: CapacitorConfig = {
  appId: 'app.standfinder.zw',
  appName: 'StandFinder',
  webDir: 'mobile/www',
  appendUserAgent: 'StandFinderApp', // = NATIVE_UA_MARKER in src/lib/native/index.ts
  backgroundColor: '#ffffff',
  server: {
    url: appUrl,
    errorPath: 'index.html',
    cleartext: false,
  },
  ios: { contentInset: 'never', limitsNavigationsToAppBoundDomains: false },
  android: { allowMixedContent: false },
  plugins: {
    SplashScreen: { launchShowDuration: 3000, launchAutoHide: true, backgroundColor: '#12805e', showSpinner: false },
    StatusBar: { style: 'LIGHT', backgroundColor: '#ffffff', overlaysWebView: false },
  },
}

export default config
