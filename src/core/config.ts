import { z } from 'zod'

const EnvSchema = z.object({
  VITE_SUPABASE_URL: z.url(),
  VITE_SUPABASE_ANON_KEY: z.string().min(20),
  VITE_VAPID_PUBLIC_KEY: z.string().optional().default(''),
  // Public pages required by the app stores (privacy policy, support). Must be absolute: the native app opens them in the system browser.
  VITE_LEGAL_BASE_URL: z.url().optional().default('https://yeu95maker.github.io/Ach/'),
  // Sign-in buttons to show, comma separated (google, azure). Empty = e-mail only, e.g. when no provider is set up in Supabase.
  VITE_OAUTH_PROVIDERS: z.string().optional().default('azure,google'),
})

export type AppConfig = {
  supabaseUrl: string
  supabaseAnonKey: string
  vapidPublicKey: string | null
  privacyUrl: string
  supportUrl: string
  oauthProviders: ('azure' | 'google')[]
}

const parsed = EnvSchema.safeParse(import.meta.env)

/** Validated runtime configuration, or `null` when the environment is incomplete. */
export const config: AppConfig | null = parsed.success
  ? {
      supabaseUrl: parsed.data.VITE_SUPABASE_URL,
      supabaseAnonKey: parsed.data.VITE_SUPABASE_ANON_KEY,
      vapidPublicKey: parsed.data.VITE_VAPID_PUBLIC_KEY || null,
      privacyUrl: new URL('privacy/', parsed.data.VITE_LEGAL_BASE_URL.replace(/\/?$/, '/')).href,
      supportUrl: new URL('support/', parsed.data.VITE_LEGAL_BASE_URL.replace(/\/?$/, '/')).href,
      oauthProviders: (['azure', 'google'] as const).filter((p) => parsed.data.VITE_OAUTH_PROVIDERS.split(',').map((s) => s.trim()).includes(p)),
    }
  : null

export const configError = parsed.success ? null : parsed.error.issues.map((i) => i.path.join('.')).join(', ')
