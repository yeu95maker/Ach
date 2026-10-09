import { Navigate, Outlet, useLocation } from 'react-router'
import { useSession } from '@/features/auth/SessionProvider'
import { TenantProvider, useTenant } from '@/features/tenant/TenantProvider'
import { ContextErrorScreen, NoEmploymentScreen, SplashScreen } from '../StatusScreens'

function TenantGate() {
  const { context, employment, isLoading, error, refetch } = useTenant()
  if (isLoading) return <SplashScreen />
  if (error || !context) return <ContextErrorScreen error={error} onRetry={refetch} />
  if (!employment) return <NoEmploymentScreen />
  return <Outlet />
}

/** Authenticated area: requires a session and an active employment. */
export function RequireAuth() {
  const { session, loading, recovery } = useSession()
  const location = useLocation()

  if (loading) return <SplashScreen />
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  if (recovery) return <Navigate to="/reset-password" replace />

  return (
    <TenantProvider>
      <TenantGate />
    </TenantProvider>
  )
}
