/**
 * Normalised application errors. The data layer converts Supabase/PostgREST
 * errors into AppError so UI code never parses SQLSTATE codes itself.
 */
export type AppErrorKind = 'forbidden' | 'conflict' | 'validation' | 'not_found' | 'rate_limited' | 'network' | 'auth' | 'unknown'

export class AppError extends Error {
  readonly kind: AppErrorKind
  readonly code: string | undefined

  constructor(kind: AppErrorKind, message: string, code?: string) {
    super(message)
    this.name = 'AppError'
    this.kind = kind
    this.code = code
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError
}

type PostgrestLikeError = { code?: string; message?: string; status?: number }

export function toAppError(error: unknown): AppError {
  if (isAppError(error)) return error
  const e = (error ?? {}) as PostgrestLikeError
  const code = e.code
  const message = e.message ?? 'Unknown error'

  switch (code) {
    case '42501':
    case 'PGRST301':
      return new AppError('forbidden', message, code)
    case '23P01': // exclusion_violation (overlap)
    case '23505': // unique_violation
      return new AppError('conflict', message, code)
    case '23514':
    case '22023':
    case '22001':
    case '22007':
    case '22008':
      return new AppError('validation', message, code)
    case 'PGRST116':
      return new AppError('not_found', message, code)
    case 'P0429': // custom: flood protection (e.g. send_unit_message)
      return new AppError('rate_limited', message, code)
  }
  if (e.status === 401) return new AppError('auth', message, code)
  if (error instanceof TypeError && /fetch/i.test(message)) return new AppError('network', message)
  return new AppError('unknown', message, code)
}

/** i18n key for a user-facing error message. */
export function errorMessageKey(error: unknown): string {
  return `errors.${toAppError(error).kind}`
}
