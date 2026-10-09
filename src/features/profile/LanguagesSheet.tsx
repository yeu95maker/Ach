import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { errorMessageKey } from '@/core/errors'
import { profileRepository } from '@/data/profileRepository'
import type { LanguageProficiency, SpokenLanguage } from '@/domain/types'
import { queryKeys } from '@/features/queryKeys'
import { Button, Select, Sheet, Spinner, cn, useToast } from '@/ui'

const LEVELS: LanguageProficiency[] = ['native', 'fluent', 'intermediate', 'basic']

export function LanguagesSheet({ userId, current, open, onClose }: { userId: string; current: SpokenLanguage[]; open: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [selected, setSelected] = useState<Map<string, LanguageProficiency>>(() => new Map(current.map((l) => [l.code, l.proficiency])))

  const catalogue = useQuery({ queryKey: queryKeys.languages(), queryFn: profileRepository.fetchLanguageCatalogue, staleTime: Infinity, enabled: open })

  const save = useMutation({
    mutationFn: () => profileRepository.setLanguages(userId, [...selected].map(([code, proficiency]) => ({ code, proficiency }))),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.context(userId) })
      toast.show({ tone: 'success', title: t('profile.saved') })
      onClose()
    },
    onError: (e) => toast.show({ tone: 'error', title: t('errors.title'), description: t(errorMessageKey(e)) }),
  })

  const toggle = (code: string) =>
    setSelected((prev) => {
      const next = new Map(prev)
      if (next.has(code)) next.delete(code)
      else next.set(code, 'fluent')
      return next
    })

  return (
    <Sheet
      open={open}
      onClose={onClose}
      closeLabel={t('common.close')}
      title={t('profile.languagesTitle')}
      description={t('profile.languagesHint')}
      footer={
        <Button size="lg" fullWidth loading={save.isPending} onClick={() => save.mutate()}>
          {t('common.save')}
        </Button>
      }
    >
      {catalogue.isLoading && <Spinner className="mx-auto my-6 text-text-3" />}
      <ul className="space-y-2">
        {catalogue.data?.map((l) => {
          const level = selected.get(l.code)
          return (
            <li key={l.code} className={cn('flex items-center gap-3 rounded-2xl border px-3 py-2 transition-colors', level ? 'border-accent/40 bg-accent-soft/40' : 'border-border/70')}>
              <button type="button" onClick={() => toggle(l.code)} aria-pressed={!!level} className="flex min-h-11 flex-1 items-center gap-3 text-left">
                <span className={cn('flex size-6 items-center justify-center rounded-full border-2 transition-colors', level ? 'border-accent bg-accent text-white' : 'border-border-strong')}>
                  {level && <Check className="size-3.5" strokeWidth={3} />}
                </span>
                <span className="text-[15px] font-medium">{l.nativeName}</span>
              </button>
              {level && (
                <Select
                  aria-label={t('profile.proficiency')}
                  value={level}
                  onChange={(e) => setSelected((prev) => new Map(prev).set(l.code, e.target.value as LanguageProficiency))}
                  className="h-10 w-40 text-sm"
                >
                  {LEVELS.map((lv) => (
                    <option key={lv} value={lv}>
                      {t(`proficiency.${lv}`)}
                    </option>
                  ))}
                </Select>
              )}
            </li>
          )
        })}
      </ul>
    </Sheet>
  )
}
