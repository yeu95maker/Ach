/// <reference types="vite/client" />

declare const __APP_VERSION__: string

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  readonly VITE_VAPID_PUBLIC_KEY?: string
  readonly VITE_LEGAL_BASE_URL?: string
  readonly VITE_OAUTH_PROVIDERS?: string
  /** 'true' once APNs/FCM are set up for the native builds (docs/APP-STORES.md → Push). */
  readonly VITE_NATIVE_PUSH?: string
}
