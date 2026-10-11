import 'server-only'
import { cache } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from './supabase/server'
import type { Account } from './types'

/** The signed-in user's account (profile, membership, provider), once per request. */
export const getAccount = cache(async (): Promise<Account | null> => {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase.rpc('my_account')
  return (data as Account | null) ?? null
})

export async function requireAccount(next: string): Promise<Account> {
  const account = await getAccount()
  if (!account) redirect(`/login?next=${encodeURIComponent(next)}`)
  return account
}
