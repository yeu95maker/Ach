import { useQuery, useQueryClient } from '@tanstack/react-query'
import { integrationRepository } from '@/data/integrationRepository'
import { rosterEditorRepository } from '@/data/rosterEditorRepository'
import { teamRepository } from '@/data/teamRepository'
import { wishRepository } from '@/data/wishRepository'
import { useEmployment } from '@/features/tenant/TenantProvider'

export const importKeys = {
  sources: (hospitalId: string) => ['import-sources', hospitalId] as const,
  run: (runId: string) => ['import-run', runId] as const,
  rows: (runId: string) => ['import-rows', runId] as const,
  preview: (runId: string) => ['import-preview', runId] as const,
  history: (hospitalId: string) => ['import-history', hospitalId] as const,
  units: (hospitalId: string) => ['import-units', hospitalId] as const,
  members: (unitId: string) => ['import-members', unitId] as const,
  shiftTypes: (unitId: string) => ['import-shift-types', unitId] as const,
}

export function useImportSources() {
  const { hospital } = useEmployment()
  return useQuery({ queryKey: importKeys.sources(hospital.id), queryFn: () => integrationRepository.fetchSources(hospital.id) })
}

/** Wards the user may import for (= wards whose roster they manage). */
export function useImportUnits() {
  const employment = useEmployment()
  return useQuery({
    queryKey: importKeys.units(employment.hospital.id),
    queryFn: async () => (await wishRepository.fetchUnits(employment.hospital.id)).filter((u) => employment.managedUnitIds.includes(u.id)),
  })
}

/** Active members of a ward (candidates when mapping an unknown ID). */
export function useWardMembers(unitId: string | null) {
  const { hospital } = useEmployment()
  return useQuery({
    queryKey: importKeys.members(unitId ?? ''),
    enabled: !!unitId,
    queryFn: async () => {
      const [members, directory] = await Promise.all([wishRepository.fetchUnitMembers([unitId!]), teamRepository.fetchDirectory(hospital.id)])
      const ids = new Set(members.map((m) => m.employeeId))
      return directory.filter((c) => ids.has(c.employeeId)).sort((a, b) => a.lastName.localeCompare(b.lastName))
    },
  })
}

export function useWardShiftTypes(unitId: string | null) {
  const { hospital } = useEmployment()
  return useQuery({
    queryKey: importKeys.shiftTypes(unitId ?? ''),
    enabled: !!unitId,
    queryFn: () => rosterEditorRepository.fetchShiftTypes(hospital.id, unitId!),
  })
}

export function useImportHistory() {
  const { hospital } = useEmployment()
  return useQuery({ queryKey: importKeys.history(hospital.id), queryFn: () => integrationRepository.history(hospital.id) })
}

export function useRefreshImport() {
  const queryClient = useQueryClient()
  return (runId?: string) =>
    Promise.all(
      [
        ...(runId ? [importKeys.run(runId), importKeys.rows(runId), importKeys.preview(runId)] : []),
        ['import-history'],
        ['editor-entries'],
        ['editor-schedule'],
        ['managed-schedules'],
        ['roster'],
      ].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
    )
}
