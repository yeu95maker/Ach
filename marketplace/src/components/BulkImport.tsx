'use client'
import { CheckCircle2, Download, FileSpreadsheet, Loader2, MapPin, XCircle } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { errorKey } from '@/lib/errors'
import { formatPrice } from '@/lib/format'
import { useI18n } from '@/lib/i18n/client'
import { IMPORT_COLUMNS, IMPORT_TEMPLATE, MAX_IMPORT_ROWS, parseCsv, rowsToDrafts, type ImportRow } from '@/lib/import'
import { toSavePayload } from '@/lib/listing'
import { supabaseBrowser } from '@/lib/supabase/client'
import { Alert, Button, Card } from './ui'

export function BulkImport() {
  const { t, locale } = useI18n()
  const router = useRouter()
  const [rows, setRows] = useState<ImportRow[] | null>(null)
  const [missing, setMissing] = useState<string[]>([])
  const [progress, setProgress] = useState<{ done: number; failed: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const valid = rows?.filter((r) => r.draft) ?? []

  async function load(file: File | undefined) {
    if (!file) return
    const result = rowsToDrafts(parseCsv(await file.text()), () => crypto.randomUUID())
    setMissing(result.missingColumns)
    setRows(result.rows)
    setProgress(null)
  }

  async function importAll() {
    setBusy(true)
    let done = 0
    let failed = 0
    const supabase = supabaseBrowser()
    const updated = [...(rows ?? [])]
    for (const [i, row] of updated.entries()) {
      if (!row.draft) continue
      const { error } = await supabase.rpc('save_property', toSavePayload(row.draft, false))
      if (error) {
        failed++
        updated[i] = { ...row, errors: [errorKey(error)] }
      } else done++
      setProgress({ done, failed })
    }
    setRows(updated)
    setBusy(false)
    router.refresh()
  }

  const templateHref = `data:text/csv;charset=utf-8,${encodeURIComponent(IMPORT_TEMPLATE)}`

  return (
    <div className="space-y-4">
      <Card className="space-y-3 p-5">
        <h2 className="font-bold text-gray-900">{t('import.step1')}</h2>
        <p className="text-sm text-gray-600">{t('import.step1Text', { max: MAX_IMPORT_ROWS })}</p>
        <p className="rounded-lg bg-gray-50 p-2 font-mono text-xs break-words text-gray-700">{IMPORT_COLUMNS.join(', ')}</p>
        <a href={templateHref} download="property-finder-import.csv" className="inline-flex items-center gap-2 text-sm font-semibold text-brand-700">
          <Download className="size-4" /> {t('import.template')}
        </a>
      </Card>

      <Card className="space-y-3 p-5">
        <h2 className="font-bold text-gray-900">{t('import.step2')}</h2>
        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-300 px-4 py-6 font-semibold text-brand-700 hover:bg-brand-50">
          <FileSpreadsheet className="size-5" /> {t('import.choose')}
          <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => load(e.target.files?.[0])} />
        </label>
        {missing.length > 0 && <Alert tone="error">{t('import.missingColumns', { columns: missing.join(', ') })}</Alert>}
      </Card>

      {rows && rows.length > 0 && (
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-4 py-3">
            <p className="text-sm font-semibold">{t('import.summary', { valid: valid.length, total: rows.length })}</p>
            {!progress && (
              <Button onClick={importAll} disabled={busy || valid.length === 0}>
                {busy && <Loader2 className="size-4 animate-spin" />}{t('import.run', { n: valid.length })}
              </Button>
            )}
          </div>
          {progress && (
            <Alert tone={progress.failed ? 'warning' : 'success'} className="m-4">
              {t('import.done', { n: progress.done })} {progress.failed > 0 && t('import.someFailed', { n: progress.failed })}{' '}
              <Link href="/provider" className="font-semibold underline">{t('import.toDashboard')}</Link>
            </Alert>
          )}
          <ul className="max-h-[28rem] divide-y divide-gray-100 overflow-y-auto">
            {rows.map((r) => (
              <li key={r.line} className="flex gap-3 px-4 py-2.5 text-sm">
                {r.draft && !r.errors.length ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-brand-600" /> : <XCircle className="mt-0.5 size-4 shrink-0 text-red-600" />}
                <div className="min-w-0">
                  <p className="font-semibold text-gray-900">
                    {t('import.line', { n: r.line })}: {r.draft ? `${r.draft.title} · ${r.draft.area} · ${r.draft.price !== null ? formatPrice(r.draft.price, 'USD', locale) : ''}` : ''}
                  </p>
                  {r.errors.length > 0 && <p className="text-red-700">{r.errors.map((e) => t(e)).join(' ')}</p>}
                  {r.draft && r.approximatePin && <p className="inline-flex items-center gap-1 text-xs text-amber-700"><MapPin className="size-3" />{t('import.approxPin')}</p>}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}
