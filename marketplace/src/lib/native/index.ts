/**
 * The iOS/Android apps (Capacitor, capacitor.config.ts) load this website and
 * append NATIVE_UA_MARKER to the user agent, so the server can tell app
 * requests apart – e.g. to hide Premium purchases, which the store rules
 * only allow via in-app purchase.
 */
export const NATIVE_UA_MARKER = 'PropertyFinderApp'

export function isNativeUserAgent(userAgent: string | null | undefined): boolean {
  return !!userAgent?.includes(NATIVE_UA_MARKER)
}

/**
 * Bundle ID (iOS) / application ID (Android) – must match appId in
 * capacitor.config.ts. It is permanent once the app is in a store.
 */
export const NATIVE_APP_ID = process.env.NATIVE_APP_ID || 'app.propertyfinder.zw'

/** Paths the apps open themselves when such a link is tapped elsewhere (universal / app links). */
export const APP_LINK_PATHS = ['/properties/*', '/providers/*', '/search', '/search/*', '/buy/*', '/rent/*', '/messages', '/messages/*', '/provider/join*']
