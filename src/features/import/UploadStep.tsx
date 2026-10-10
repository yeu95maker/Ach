import { FileSpreadsheet, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { adapterForFile, sha256Hex } from '@/domain/integration/adapters'
import type { RawTable } from '@/domain/integration/types'
import type { ISODate } from '@/domain/types'
import { useHospitalFormatter } from '@/features/tenant/useHospitalFormatter'
import { Button, Card, Field, Select, cn } from '@/ui'
import { useImportSources, useImportUnits } from './useImport'

export interface UploadResult {
  unitId: string
  sourceId: string
  periodStart: ISODate
  periodEnd: ISODate
  fileName: string
  fileSha256: string
  tables: RawTable[]
}

const MAX_FILE_BYTES = 15 * 1024 * 1024

const monthStart = (offset: number) => {
  const d = new Date()
  const m = new Date(d.getFullYear(), d.getMonth() + offset, 1)
  return `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}-01`
}
const monthEnd = (start: ISODate) => {
  const [y, m] = start.split('-').map(Number)
  const last = new Date(Date.UTC(y!, m!, 0)).getUTCDate()
  return `${start.slice(0, 8)}${String(last).padStart(2, '0')}`
}

export function UploadStep({ onDone }: { onDone: (r: UploadResult) => void }) {
  const { t } = useTranslation()
  const fmt = useHospitalFormatter()
  const units = useImportUnits()
  const sources = useImportSources()
  const input = useRef<HTMLInputElement>(null)
  const [unitId, setUnitId] = useState('')
  const [sourceId, setSourceId] = useState('')
  const [month, setMonth] = useState(monthStart(1))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [drag, setDrag] = useState(false)

  const unit = unitId || units.data?.[0]?.id || ''
  const available = (sources.data ?? []).filter((s) => s.isActive && s.kind === 'file' && (!s.unitId || s.unitId === unit))
  const source = available.find((s) => s.id === sourceId) ?? available[0]

  const read = async (file: File) => {
    setError(null)
    const adapter = adapterForFile(file.name, file.type)
    if (!adapter?.readFile) return setError(t('integration.errors.format'))
    if (file.size > MAX_FILE_BYTES) return setError(t('integration.errors.size'))
    if (!unit || !source) return setError(t('integration.errors.noProfile'))
    setBusy(true)
    try {
      const bytes = new Uint8Array(await file.arrayBuffer())
      const tables = adapter.readFile(bytes, file.name).filter((x) => x.rows.length > 0)
      if (!tables.length) return setError(t('integration.errors.empty'))
      onDone({ unitId: unit, sourceId: source.id, periodStart: month, periodEnd: monthEnd(month), fileName: file.name, fileSha256: await sha256Hex(bytes), tables })
    } catch {
      setError(t('integration.errors.unreadable'))
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ''
    }
  }

  const months = Array.from({ length: 6 }, (_, i) => monthStart(i - 1))

  return (
    <Card padding="lg" className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={t('integration.ward')} htmlFor="imp-unit">
          <Select id="imp-unit" value={unit} onChange={(e) => setUnitId(e.target.value)}>
            {(units.data ?? []).map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('integration.month')} htmlFor="imp-month">
          <Select id="imp-month" value={month} onChange={(e) => setMonth(e.target.value)}>
            {months.map((m) => (
              <option key={m} value={m}>
                {fmt.monthYear(m)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('integration.profile')} htmlFor="imp-source" hint={source?.vendor ?? undefined}>
          <Select id="imp-source" value={source?.id ?? ''} onChange={(e) => setSourceId(e.target.value)}>
            {available.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <label
        onDragOver={(e) => {
          e.preventDefault()
          setDrag(true)
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDrag(false)
          const f = e.dataTransfer.files[0]
          if (f) void read(f)
        }}
        className={cn(
          'flex cursor-pointer flex-col items-center justify-center gap-3 rounded-[var(--radius-card)] border-2 border-dashed px-6 py-10 text-center transition-colors',
          drag ? 'border-primary bg-primary-soft/40' : 'border-border-strong hover:bg-surface-2/60',
        )}
      >
        <span className="flex size-14 items-center justify-center rounded-2xl bg-primary-soft text-primary-text">
          <FileSpreadsheet className="size-7" aria-hidden />
        </span>
        <span className="text-[16px] font-semibold">{t('integration.dropTitle')}</span>
        <span className="max-w-md text-sm text-text-2">{t('integration.dropHint')}</span>
        <input
          ref={input}
          type="file"
          accept=".csv,.txt,.tsv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="sr-only"
          data-testid="import-file"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void read(f)
          }}
        />
        <Button type="button" variant="soft" icon={<Upload className="size-[18px]" />} loading={busy} onClick={() => input.current?.click()}>
          {t('integration.chooseFile')}
        </Button>
      </label>
      {error && <p className="rounded-2xl bg-danger-soft px-4 py-3 text-sm text-danger-text">{error}</p>}
      <p className="text-xs text-text-3">{t('integration.privacyHint')}</p>
    </Card>
  )
}
