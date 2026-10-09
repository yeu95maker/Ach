import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { authStorage } from './authStorage'
import { config } from './config'

let client: SupabaseClient | null = null

/** Singleton Supabase client. Only the data layer (src/data) should import this. */
export function getSupabase(): SupabaseClient {
  if (!config) throw new Error('Supabase is not configured')
  client ??= createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: {
      storage: authStorage,
      storageKey: 'shiftcare.auth',
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
    },
    realtime: { params: { eventsPerSecond: 5 } },
  })
  return client
}
