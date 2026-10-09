import { Languages, Mail, MapPin, Phone } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { PersonAvatar } from '@/components/PersonAvatar'
import type { Qualification } from '@/domain/types'
import { Badge, Card } from '@/ui'

export interface ColleagueCardData {
  firstName: string
  lastName: string
  avatarPath: string | null
  jobTitle: string
  unitName: string | null
  qualifications: Qualification[]
  languages?: string[]
  email?: string | null
  phone?: string | null
}

export function ColleagueCard({ person, trailing }: { person: ColleagueCardData; trailing?: ReactNode }) {
  const { t } = useTranslation()
  return (
    <Card padding="sm" className="flex h-full flex-col gap-4 sm:p-5">
      <div className="flex items-start gap-4">
        <PersonAvatar person={person} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[17px] font-semibold">{`${person.firstName} ${person.lastName}`}</p>
          <p className="truncate text-sm text-text-2">{person.jobTitle || '—'}</p>
          {person.unitName && (
            <p className="mt-1 flex items-center gap-1.5 truncate text-sm text-text-3">
              <MapPin className="size-3.5 shrink-0" aria-hidden />
              {person.unitName}
            </p>
          )}
        </div>
        {trailing}
      </div>

      {(person.qualifications.length > 0 || (person.languages?.length ?? 0) > 0) && (
        <div className="flex flex-wrap gap-1.5">
          {person.qualifications.map((q) => (
            <Badge key={q.id} tone="primary" className="h-6 text-xs" >
              <span title={q.name}>{q.name}</span>
            </Badge>
          ))}
          {person.languages && person.languages.length > 0 && (
            <Badge tone="neutral" className="h-6 text-xs">
              <Languages className="size-3.5" aria-label={t('profile.languages')} />
              {person.languages.map((l) => l.toUpperCase()).join(' · ')}
            </Badge>
          )}
        </div>
      )}

      {(person.email || person.phone) && (
        <div className="mt-auto flex flex-wrap gap-2 border-t border-border/70 pt-3">
          {person.phone && (
            <a href={`tel:${person.phone.replace(/\s/g, '')}`} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-surface-2 px-3 text-sm font-medium text-text-2 hover:text-text">
              <Phone className="size-4" aria-hidden />
              {person.phone}
            </a>
          )}
          {person.email && (
            <a href={`mailto:${person.email}`} className="inline-flex h-9 min-w-0 items-center gap-1.5 rounded-full bg-surface-2 px-3 text-sm font-medium text-text-2 hover:text-text">
              <Mail className="size-4 shrink-0" aria-hidden />
              <span className="truncate">{person.email}</span>
            </a>
          )}
        </div>
      )}
    </Card>
  )
}
