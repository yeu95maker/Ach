import type { NewsCategory, NewsItem } from './types'

/** Display order of the categories (filter chips, compose form). */
export const NEWS_CATEGORIES: readonly NewsCategory[] = [
  'information',
  'training',
  'further_education',
  'workshop',
  'team_meeting',
  'doctor_meeting',
  'other',
]

/** Categories that usually have a date – the compose form opens the date fields for them. */
export const EVENT_CATEGORIES: ReadonlySet<NewsCategory> = new Set(['training', 'further_education', 'workshop', 'team_meeting', 'doctor_meeting'])

export interface NewsFeed {
  /** Dated items that have not ended yet, soonest first. */
  upcoming: NewsItem[]
  /** Everything else, newest first. */
  latest: NewsItem[]
}

/** Splits the feed into upcoming dates ("Termine") and the rest. */
export function splitFeed(items: readonly NewsItem[], now = new Date()): NewsFeed {
  const isUpcoming = (n: NewsItem) => !!n.eventStartsAt && (n.eventEndsAt ?? n.eventStartsAt).getTime() >= now.getTime()
  const upcoming = items.filter(isUpcoming).sort((a, b) => a.eventStartsAt!.getTime() - b.eventStartsAt!.getTime())
  const latest = items.filter((n) => !isUpcoming(n)).sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())
  return { upcoming, latest }
}

/** Validation of the compose form; returns i18n keys of the problems. */
export function validateNewsDraft(d: { title: string; body: string; eventStartsAt: Date | null; eventEndsAt: Date | null }): string[] {
  const errors: string[] = []
  if (!d.title.trim()) errors.push('news.errors.title')
  if (!d.body.trim()) errors.push('news.errors.body')
  if (d.eventEndsAt && !d.eventStartsAt) errors.push('news.errors.endWithoutStart')
  if (d.eventStartsAt && d.eventEndsAt && d.eventEndsAt.getTime() < d.eventStartsAt.getTime()) errors.push('news.errors.endBeforeStart')
  return errors
}
