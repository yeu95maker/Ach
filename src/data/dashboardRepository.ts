import type { DashboardSummary } from '@/domain/types'
import { db, unwrap } from './client'
import { mapDashboard } from './mappers'
import type { DashboardRow } from './rows'

export const dashboardRepository = {
  /** Aggregated home screen data in a single round trip (RLS applies). */
  async fetch(employeeId: string): Promise<DashboardSummary> {
    const row = unwrap<DashboardRow>(await db().rpc('get_dashboard', { p_employee_id: employeeId }))
    return mapDashboard(row)
  },
}
