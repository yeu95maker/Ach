import 'server-only'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { SUPABASE_ANON_KEY, SUPABASE_URL } from './env'

/** Supabase client for Server Components, Route Handlers and Server Actions (acts as the signed-in user). */
export async function createClient() {
  const cookieStore = await cookies()
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) cookieStore.set(name, value, options)
        } catch {
          // Called from a Server Component: the proxy refreshes the session instead.
        }
      },
    },
  })
}
