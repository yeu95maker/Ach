import type { Session } from '@supabase/supabase-js'
import { useQueryClient } from '@tanstack/react-query'
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { authRepository } from '@/data/authRepository'

type SessionState = {
  session: Session | null
  loading: boolean
  /** True after the user opened a password-recovery link. */
  recovery: boolean
  clearRecovery: () => void
}

const SessionContext = createContext<SessionState | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [recovery, setRecovery] = useState(false)

  useEffect(() => {
    let active = true
    authRepository
      .getSession()
      .then((s) => active && setSession(s))
      .catch(() => active && setSession(null))
      .finally(() => active && setLoading(false))

    const unsubscribe = authRepository.onAuthStateChange((event, next) => {
      if (event === 'PASSWORD_RECOVERY') setRecovery(true)
      if (event === 'SIGNED_OUT') queryClient.clear() // never leak cached data to the next user
      setSession(next)
      setLoading(false)
    })
    return () => {
      active = false
      unsubscribe()
    }
  }, [queryClient])

  const value = useMemo(() => ({ session, loading, recovery, clearRecovery: () => setRecovery(false) }), [session, loading, recovery])
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession() {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession must be used inside SessionProvider')
  return ctx
}
