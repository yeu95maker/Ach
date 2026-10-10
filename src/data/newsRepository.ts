import type { NewsCategory, NewsDraft, NewsItem, NewsTarget } from '@/domain/types'
import { db, unwrap, unwrapList } from './client'

interface NewsRow {
  id: string
  unit_id: string | null
  title: string
  body: string
  priority: 'normal' | 'important'
  category: NewsCategory
  published_at: string
  event_starts_at: string | null
  event_ends_at: string | null
  location: string | null
  author_id: string | null
  units: { name: string } | null
}

const COLUMNS =
  'id, unit_id, title, body, priority, category, published_at, event_starts_at, event_ends_at, location, author_id, units(name)'

const toDate = (v: string | null) => (v ? new Date(v) : null)

function mapNews(row: NewsRow): NewsItem {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    priority: row.priority,
    category: row.category,
    publishedAt: new Date(row.published_at),
    unitId: row.unit_id,
    unitName: row.units?.name ?? null,
    eventStartsAt: toDate(row.event_starts_at),
    eventEndsAt: toDate(row.event_ends_at),
    location: row.location,
    authorId: row.author_id,
  }
}

export const newsRepository = {
  /** Visible "Aktuelles" of the hospital (RLS: own wards + whole hospital, published, not expired). */
  async fetchFeed(hospitalId: string, limit = 100): Promise<NewsItem[]> {
    const rows = unwrapList<NewsRow>(
      await db()
        .from('announcements')
        .select(COLUMNS)
        .eq('hospital_id', hospitalId)
        .lte('published_at', new Date().toISOString())
        .order('published_at', { ascending: false })
        .limit(limit),
    )
    return rows.map(mapNews)
  },

  /** Wards (and possibly the whole hospital) the user may publish to. */
  async fetchTargets(hospitalId: string): Promise<NewsTarget[]> {
    const rows = unwrapList<{ hospital_id: string; unit_id: string | null; unit_name: string | null }>(
      await db().rpc('my_announcement_targets'),
    )
    return rows.filter((r) => r.hospital_id === hospitalId).map((r) => ({ hospitalId: r.hospital_id, unitId: r.unit_id, unitName: r.unit_name }))
  },

  /** Publishes immediately; the team is notified by a database trigger. */
  async publish(draft: NewsDraft): Promise<NewsItem> {
    const row = unwrap<NewsRow>(
      await db()
        .from('announcements')
        .insert({
          hospital_id: draft.hospitalId,
          unit_id: draft.unitId,
          category: draft.category,
          title: draft.title.trim(),
          body: draft.body.trim(),
          priority: draft.priority,
          event_starts_at: draft.eventStartsAt?.toISOString() ?? null,
          event_ends_at: draft.eventEndsAt?.toISOString() ?? null,
          location: draft.location?.trim() || null,
          published_at: new Date().toISOString(),
        })
        .select(COLUMNS)
        .single(),
    )
    return mapNews(row)
  },

  async remove(id: string): Promise<void> {
    unwrap(await db().from('announcements').delete().eq('id', id))
  },
}
