import { ChevronRight, FileText, GraduationCap, ListChecks } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { needsAction, openAcks } from '@/domain/documents'
import { useDocuments } from '@/features/documents/useDocuments'
import { useMyTrainings } from '@/features/trainings/useTrainings'
import { Card, CardHeader } from '@/ui'

/** "Zu erledigen": documents to confirm and trainings that are due. Hidden when nothing is open. */
export function TodoCard() {
  const { t } = useTranslation()
  const docs = useDocuments()
  const trainings = useMyTrainings()
  const toConfirm = openAcks(docs.data ?? []).length
  const due = (trainings.data ?? []).filter((x) => needsAction(x.status)).length
  if (!toConfirm && !due) return null

  const row = (to: string, icon: ReactNode, label: string) => (
    <Link to={to} className="flex items-center gap-3 rounded-2xl bg-surface-2/70 px-4 py-3 transition-colors hover:bg-surface-2">
      <span className="text-text-3 [&_svg]:size-5">{icon}</span>
      <span className="min-w-0 flex-1 text-[15px] font-medium">{label}</span>
      <ChevronRight className="size-4 text-text-3" aria-hidden />
    </Link>
  )

  return (
    <Card>
      <CardHeader
        title={t('todo.title')}
        icon={
          <span className="flex size-10 items-center justify-center rounded-xl bg-warning-soft text-warning-text">
            <ListChecks className="size-5" />
          </span>
        }
      />
      <div className="space-y-2">
        {toConfirm > 0 && row('/documents', <FileText />, t('todo.documents', { count: toConfirm }))}
        {due > 0 && row('/trainings', <GraduationCap />, t('todo.trainings', { count: due }))}
      </div>
    </Card>
  )
}
