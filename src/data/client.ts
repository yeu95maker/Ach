import { getSupabase } from '@/core/supabase'
import { toAppError } from '@/core/errors'

export { getSupabase as db }

/**
 * Any Supabase response. Row shapes are asserted by the caller (see rows.ts):
 * the untyped client infers embedded relations imprecisely.
 */
type Result = { data: unknown; error: unknown }

/** Throw a normalised AppError on failure, otherwise return data. */
export function unwrap<T>(result: Result): T {
  if (result.error) throw toAppError(result.error)
  return result.data as T
}

export function unwrapList<T>(result: Result): T[] {
  return unwrap<T[] | null>(result) ?? []
}
