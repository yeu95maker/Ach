import type { SessionContext } from '@/domain/types'
import { db, unwrap } from './client'
import { mapContext } from './mappers'
import type { MyContextRow } from './rows'

export const contextRepository = {
  /** User, employments, roles and effective permissions in a single round trip. */
  async fetch(): Promise<SessionContext> {
    const row = unwrap<MyContextRow>(await db().rpc('my_context'))
    return mapContext(row)
  },
}
