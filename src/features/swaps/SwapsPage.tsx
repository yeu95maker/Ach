import { ArrowLeftRight } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'
import { QueryError, Stagger } from '@/components/QueryState'
import { isOpen, needsMe } from '@/domain/swaps'
import { Card, EmptyState, PageHeader, SectionTitle, SkeletonCard } from '@/ui'
import { SwapCard } from './SwapCard'
import { SwapOfferSheet } from './SwapOfferSheet'
import { useSwaps } from './useSwaps'

export function SwapsPage() {
  const { t } = useTranslation()
  const swaps = useSwaps()
  const [params, setParams] = useSearchParams()
  const offer = params.get('offer')

  const groups = useMemo(() => {
    const all = swaps.data ?? []
    return {
      mine: all.filter(needsMe),
      open: all.filter((s) => isOpen(s) && !needsMe(s)),
      done: all.filter((s) => !isOpen(s)),
    }
  }, [swaps.data])

  const section = (title: string, list: typeof groups.mine, offset: number) =>
    list.length > 0 && (
      <section className="mb-8">
        <SectionTitle>{title}</SectionTitle>
        <div className="grid gap-4 lg:grid-cols-2">
          {list.map((s, i) => (
            <Stagger key={s.id} index={offset + i}>
              <SwapCard swap={s} />
            </Stagger>
          ))}
        </div>
      </section>
    )

  return (
    <>
      <PageHeader title={t('swaps.title')} subtitle={t('swaps.subtitle')} />

      {swaps.isLoading && <SkeletonCard lines={3} />}
      {swaps.error && <QueryError error={swaps.error} onRetry={() => void swaps.refetch()} />}
      {swaps.data && swaps.data.length === 0 && (
        <Card>
          <EmptyState icon={<ArrowLeftRight />} title={t('swaps.empty')} description={t('swaps.emptyHint')} />
        </Card>
      )}

      {section(t('swaps.needsYou'), groups.mine, 0)}
      {section(t('swaps.open'), groups.open, groups.mine.length)}
      {section(t('swaps.done'), groups.done, groups.mine.length + groups.open.length)}

      <p className="mt-2 px-1 text-sm text-text-3">{t('swaps.howItWorks')}</p>

      <SwapOfferSheet
        entryId={offer}
        onClose={() => {
          params.delete('offer')
          setParams(params, { replace: true })
        }}
      />
    </>
  )
}
