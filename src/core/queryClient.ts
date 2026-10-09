import { QueryClient } from '@tanstack/react-query'
import { isAppError } from './errors'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 10 * 60_000,
      refetchOnWindowFocus: true,
      retry: (count, error) => !(isAppError(error) && error.kind === 'forbidden') && count < 2,
    },
    mutations: { retry: false },
  },
})
