import { BookOpen, GraduationCap, Info, Megaphone, Stethoscope, UsersRound, Wrench, type LucideIcon } from 'lucide-react'
import type { NewsCategory } from '@/domain/types'

export const NEWS_STYLE: Record<NewsCategory, { icon: LucideIcon; tone: string }> = {
  information: { icon: Info, tone: 'bg-accent-soft text-accent-text' },
  training: { icon: GraduationCap, tone: 'bg-primary-soft text-primary-text' },
  further_education: { icon: BookOpen, tone: 'bg-night-soft text-night-text' },
  workshop: { icon: Wrench, tone: 'bg-late-soft text-late-text' },
  team_meeting: { icon: UsersRound, tone: 'bg-success-soft text-success-text' },
  doctor_meeting: { icon: Stethoscope, tone: 'bg-early-soft text-early-text' },
  other: { icon: Megaphone, tone: 'bg-surface-2 text-text-2' },
}
