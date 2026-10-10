import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { teamRepository } from '@/data/teamRepository'
import { isWithin } from '@/domain/dates'
import type { ISODate } from '@/domain/types'
import { queryKeys } from '@/features/queryKeys'
import { useEmployment } from '@/features/tenant/TenantProvider'

/** Sick colleagues on my wards in a date range (who + when, never why). */
export function useColleagueSickLeaves(from: ISODate, to: ISODate = from) {
  const employment = useEmployment()
  const query = useQuery({
    queryKey: queryKeys.colleagueSick(employment.hospital.id, from, to),
    queryFn: () => teamRepository.fetchColleagueSickLeaves(employment.hospital.id, from, to),
  })
  const isSickOn = useMemo(() => {
    const list = query.data ?? []
    return (employeeId: string | null, date: ISODate) =>
      !!employeeId && list.some((s) => s.employeeId === employeeId && isWithin(date, s.startDate, s.endDate))
  }, [query.data])
  return { ...query, isSickOn }
}
