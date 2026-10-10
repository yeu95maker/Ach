import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Check } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useSearchParams } from 'react-router'
import { integrationRepository, type ImportRun } from '@/data/integrationRepository'
import { PageHeader, SegmentedControl, SkeletonCard, cn } from '@/ui'
import { ColumnsStep } from './ColumnsStep'
import { ImportHistory } from './ImportHistory'
import { PreviewStep } from './PreviewStep'
import { ReviewStep } from './ReviewStep'
import { UploadStep, type UploadResult } from './UploadStep'
import { importKeys } from './useImport'

type Step = 'upload' | 'columns' | 'review' | 'preview'
const STEPS: Step[] = ['upload', 'columns', 'review', 'preview']

function Stepper({ step }: { step: Step }) {
  const { t } = useTranslation()
  const index = STEPS.indexOf(step)
  return (
    <ol className="mb-6 grid grid-cols-4 gap-2" aria-label={t('integration.steps')}>
      {STEPS.map((s, i) => (
        <li key={s} aria-current={i === index ? 'step' : undefined} className="min-w-0">
          <span className={cn('block h-1.5 rounded-full', i <= index ? 'bg-primary' : 'bg-surface-3')} />
          <span className={cn('mt-2 flex items-center gap-1.5 truncate text-xs font-semibold sm:text-sm', i === index ? 'text-text' : 'text-text-3')}>
            {i < index && <Check className="size-3.5 shrink-0" aria-hidden />}
            {t(`integration.step.${s}`)}
          </span>
        </li>
      ))}
    </ol>
  )
}

/** Integration Hub · Dateiimport: upload → columns → review/mapping → preview → apply → publish. */
export function ImportPage() {
  const { t } = useTranslation()
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') === 'history' ? 'history' : 'new'
  const runParam = params.get('run')
  const [upload, setUpload] = useState<UploadResult | null>(null)
  const [step, setStep] = useState<Step>(runParam ? 'review' : 'upload')

  const run = useQuery({
    queryKey: importKeys.run(runParam ?? ''),
    queryFn: () => integrationRepository.fetchRun(runParam!),
    enabled: !!runParam,
  })
  const saved = useQuery({
    queryKey: ['import-last-mapping', upload?.sourceId, upload?.unitId],
    queryFn: () => integrationRepository.lastMapping(upload!.sourceId, upload!.unitId),
    enabled: !!upload,
  })

  const restart = () => {
    setUpload(null)
    setStep('upload')
    setParams({}, { replace: true })
  }
  const onStaged = (r: ImportRun) => {
    setParams({ run: r.id }, { replace: true })
    setStep('review')
  }

  return (
    <>
      <Link to="/schedule" className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-primary-text hover:underline">
        <ArrowLeft className="size-4" aria-hidden />
        {t('schedule.title')}
      </Link>
      <PageHeader
        title={t('integration.title')}
        subtitle={t('integration.subtitle')}
        actions={
          <SegmentedControl
            label={t('integration.title')}
            value={tab}
            onChange={(v) => setParams(v === 'history' ? { tab: 'history' } : runParam ? { run: runParam } : {}, { replace: true })}
            options={[
              { value: 'new', label: t('integration.tabNew') },
              { value: 'history', label: t('integration.tabHistory') },
            ]}
            className="w-[260px]"
          />
        }
      />

      {tab === 'history' ? (
        <ImportHistory />
      ) : (
        <>
          <Stepper step={step} />
          {step === 'upload' && (
            <UploadStep
              onDone={(u) => {
                setUpload(u)
                setStep('columns')
              }}
            />
          )}
          {step === 'columns' && upload && (saved.isLoading ? <SkeletonCard lines={4} /> : <ColumnsStep upload={upload} saved={saved.data ?? null} onStaged={onStaged} onBack={restart} />)}
          {step === 'review' && runParam && <ReviewStep runId={runParam} onNext={() => setStep('preview')} onReupload={restart} />}
          {step === 'preview' && runParam && (run.data ? <PreviewStep run={run.data} onBack={() => setStep('review')} onDone={restart} /> : <SkeletonCard lines={4} />)}
        </>
      )}
    </>
  )
}
