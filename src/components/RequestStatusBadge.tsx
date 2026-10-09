import { useTranslation } from 'react-i18next'
import type { RequestStatus, SickLeaveStatus } from '@/domain/types'
import { Badge, type Tone } from '@/ui'

const REQUEST_TONES: Record<RequestStatus, Tone> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
  cancelled: 'neutral',
}

const SICK_TONES: Record<SickLeaveStatus, Tone> = {
  reported: 'warning',
  acknowledged: 'success',
  closed: 'neutral',
  cancelled: 'neutral',
}

export function RequestStatusBadge({ status }: { status: RequestStatus }) {
  const { t } = useTranslation()
  return (
    <Badge tone={REQUEST_TONES[status]} dot>
      {t(`requestStatus.${status}`)}
    </Badge>
  )
}

export function SickLeaveStatusBadge({ status }: { status: SickLeaveStatus }) {
  const { t } = useTranslation()
  return (
    <Badge tone={SICK_TONES[status]} dot>
      {t(`sickStatus.${status}`)}
    </Badge>
  )
}
