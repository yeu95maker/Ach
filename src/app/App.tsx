import { QueryClientProvider } from '@tanstack/react-query'
import { Suspense } from 'react'
import { RouterProvider } from 'react-router'
import { configError } from '@/core/config'
import { queryClient } from '@/core/queryClient'
import { ThemeProvider } from '@/core/theme'
import { SessionProvider } from '@/features/auth/SessionProvider'
import { ToastProvider } from '@/ui'
import { router } from './router'
import { ConfigErrorScreen, SplashScreen } from './StatusScreens'

export function App() {
  if (configError) return <ConfigErrorScreen missing={configError} />
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <SessionProvider>
            <Suspense fallback={<SplashScreen />}>
              <RouterProvider router={router} />
            </Suspense>
          </SessionProvider>
        </ToastProvider>
      </QueryClientProvider>
    </ThemeProvider>
  )
}
