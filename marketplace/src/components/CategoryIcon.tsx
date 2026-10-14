import { BedDouble, Building2, House, LandPlot, Store } from 'lucide-react'
import type { Category } from '@/lib/types'

const ICONS = { apartment: Building2, house: House, land: LandPlot, commercial: Store, room: BedDouble }
export const CATEGORY_EMOJI: Record<Category, string> = { apartment: '🏢', house: '🏠', land: '🌍', commercial: '🏬', room: '🛏️' }

export function CategoryIcon({ category, className }: { category: Category; className?: string }) {
  const Icon = ICONS[category]
  return <Icon className={className} aria-hidden />
}
