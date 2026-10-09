import { useQuery } from '@tanstack/react-query'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { changeLanguage, isUiLanguage } from '@/core/i18n'
import { useTheme } from '@/core/theme'
import { contextRepository } from '@/data/contextRepository'
import { can as canFn, type Permission } from '@/domain/permissions'
import type { Employment, SessionContext } from '@/domain/types'
import { useSession } from '@/features/auth/SessionProvider'
import { queryKeys } from '@/features/queryKeys'

const STORAGE_KEY = 'shiftcare.employment'

type TenantState = {
  context: SessionContext | undefined
  employment: Employment | null
  isLoading: boolean
  error: unknown
  selectEmployment: (employeeId: string) => void
  can: (permission: Permission) => boolean
  refetch: () => void
}

const TenantContext = createContext<TenantState | null>(null)

function storedEmploymentId() {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

export function TenantProvider({ children }: { children: ReactNode }) {
  const { session } = useSession()
  const { setPreference } = useTheme()
  const userId = session?.user.id
  const [selectedId, setSelectedId] = useState<string | null>(storedEmploymentId)

  const query = useQuery({
    queryKey: queryKeys.context(userId ?? 'anonymous'),
    queryFn: () => contextRepository.fetch(),
    enabled: !!userId,
    staleTime: 5 * 60_000,
  })

  // Apply the profile's language and theme once per sign-in (profile is the
  // source of truth across devices).
  const appliedFor = useRef<string | null>(null)
  useEffect(() => {
    const user = query.data?.user
    if (!user || appliedFor.current === user.id) return
    appliedFor.current = user.id
    if (isUiLanguage(user.preferredLocale)) void changeLanguage(user.preferredLocale)
    setPreference(user.theme)
  }, [query.data, setPreference])

  const employment = useMemo(() => {
    const list = query.data?.employments ?? []
    return list.find((e) => e.employeeId === selectedId) ?? list[0] ?? null
  }, [query.data, selectedId])

  const selectEmployment = useCallback((employeeId: string) => {
    setSelectedId(employeeId)
    try {
      localStorage.setItem(STORAGE_KEY, employeeId)
    } catch {
      /* ignore */
    }
  }, [])

  const can = useCallback((permission: Permission) => canFn(employment, permission), [employment])
  const { refetch } = query

  const value = useMemo<TenantState>(
    () => ({
      context: query.data,
      employment,
      isLoading: query.isLoading,
      error: query.error,
      selectEmployment,
      can,
      refetch: () => void refetch(),
    }),
    [query.data, query.isLoading, query.error, employment, selectEmployment, can, refetch],
  )

  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>
}

export function useTenant() {
  const ctx = useContext(TenantContext)
  if (!ctx) throw new Error('useTenant must be used inside TenantProvider')
  return ctx
}

/** For screens inside the authenticated shell, where an employment is guaranteed. */
export function useEmployment(): Employment {
  const { employment } = useTenant()
  if (!employment) throw new Error('No active employment')
  return employment
}

export function useCurrentUser() {
  const { context } = useTenant()
  if (!context) throw new Error('No session context')
  return context.user
}
