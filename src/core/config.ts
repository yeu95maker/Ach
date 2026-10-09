import { z } from 'zod'

const EnvSchema = z.object({
  VITE_SUPABASE_URL: z.url(),
  VITE_SUPABASE_ANON_KEY: z.string().min(20),
  VITE_VAPID_PUBLIC_KEY: z.string().optional().default(''),
})

export type AppConfig = {
  supabaseUrl: string
  supabaseAnonKey: string
  vapidPublicKey: string | null
}

const parsed = EnvSchema.safeParse(import.meta.env)

/** Validated runtime configuration, or `null` when the environment is incomplete. */
export const config: AppConfig | null = parsed.success
  ? {
      supabaseUrl: parsed.data.VITE_SUPABASE_URL,
      supabaseAnonKey: parsed.data.VITE_SUPABASE_ANON_KEY,
      vapidPublicKey: parsed.data.VITE_VAPID_PUBLIC_KEY || null,
    }
  : null

export const configError = parsed.success ? null : parsed.error.issues.map((i) => i.path.join('.')).join(', ')
