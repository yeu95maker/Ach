import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { isoDateInTimeZone } from '@/domain/dates'
import { payloadString } from '@/domain/notifications'
import type { AppNotification } from '@/domain/types'
import { useTenant } from '@/features/tenant/TenantProvider'
import { useHospitalFormatter } from '@/features/tenant/useHospitalFormatter'

/** Renders type + payload into localised text (nothing pre-rendered is stored). */
export function useNotificationText() {
  const { t } = useTranslation()
  const fmt = useHospitalFormatter()
  const timeZone = useTenant().employment?.hospital.timezone ?? 'Europe/Berlin'

  return useCallback(
    (n: Pick<AppNotification, 'type' | 'payload'>) => {
      const p = (k: string) => payloadString(n, k)
      const range = p('start_date') && p('end_date') ? fmt.dateRange(p('start_date'), p('end_date')) : ''
      const period = p('period_start') && p('period_end') ? fmt.dateRange(p('period_start'), p('period_end')) : ''
      const date = p('entry_date') ? fmt.dateShort(p('entry_date')) : ''
      const time = p('starts_at') && p('ends_at') ? fmt.timeRange(new Date(p('starts_at')), new Date(p('ends_at'))) : ''
      const vars = {
        unit: p('unit_name'),
        name: p('employee_name'),
        title: p('title'),
        leaveType: p('leave_type') ? t(`leaveType.${p('leave_type')}`) : '',
        range,
        period,
        date,
        time,
        note: p('decision_note'),
        status: p('status') && n.type === 'sick_leave_updated' ? t(`sickStatus.${p('status')}`) : '',
        wishStatus: p('status') && n.type === 'wish_plan_reviewed' ? t(`wishStatus.${p('status')}`) : '',
        deadline: p('deadline_at') ? `${fmt.dateShort(isoDateInTimeZone(new Date(p('deadline_at')), timeZone))}, ${fmt.time(new Date(p('deadline_at')))}` : '',
        count: Number(p('count') || 0),
      }
      return {
        title: t(`notifications.types.${n.type}.title`, vars),
        body: t(`notifications.types.${n.type}.body`, vars),
      }
    },
    [t, fmt, timeZone],
  )
}
