import { useFormatter } from '@/core/format'
import { useTenant } from './TenantProvider'

/** Formatter bound to the UI language and the active hospital's time zone. */
export function useHospitalFormatter() {
  const { employment } = useTenant()
  return useFormatter(employment?.hospital.timezone ?? 'Europe/Berlin')
}
