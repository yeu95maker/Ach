import { describe, expect, it } from 'vitest'
import { splitFeed, validateNewsDraft } from './news'
import type { NewsItem } from './types'

const item = (id: string, over: Partial<NewsItem>): NewsItem => ({
  id,
  title: id,
  body: 'b',
  priority: 'normal',
  publishedAt: new Date('2026-10-01T08:00:00Z'),
  category: 'information',
  unitId: null,
  unitName: null,
  eventStartsAt: null,
  eventEndsAt: null,
  location: null,
  authorId: null,
  ...over,
})

describe('splitFeed', () => {
  const now = new Date('2026-10-10T12:00:00Z')

  it('puts future dates first, soonest first', () => {
    const feed = splitFeed(
      [
        item('later', { eventStartsAt: new Date('2026-10-20T09:00:00Z') }),
        item('soon', { eventStartsAt: new Date('2026-10-12T09:00:00Z') }),
        item('info', {}),
      ],
      now,
    )
    expect(feed.upcoming.map((n) => n.id)).toEqual(['soon', 'later'])
    expect(feed.latest.map((n) => n.id)).toEqual(['info'])
  })

  it('keeps a running event upcoming until it ends', () => {
    const feed = splitFeed([item('running', { eventStartsAt: new Date('2026-10-10T10:00:00Z'), eventEndsAt: new Date('2026-10-10T14:00:00Z') })], now)
    expect(feed.upcoming).toHaveLength(1)
  })

  it('moves past events to the latest list, newest first', () => {
    const feed = splitFeed(
      [
        item('old', { eventStartsAt: new Date('2026-10-01T09:00:00Z'), publishedAt: new Date('2026-09-20T08:00:00Z') }),
        item('new', { publishedAt: new Date('2026-10-09T08:00:00Z') }),
      ],
      now,
    )
    expect(feed.upcoming).toHaveLength(0)
    expect(feed.latest.map((n) => n.id)).toEqual(['new', 'old'])
  })
})

describe('validateNewsDraft', () => {
  it('requires title and text', () => {
    expect(validateNewsDraft({ title: ' ', body: '', eventStartsAt: null, eventEndsAt: null })).toEqual(['news.errors.title', 'news.errors.body'])
  })

  it('rejects an end before the start', () => {
    expect(
      validateNewsDraft({ title: 't', body: 'b', eventStartsAt: new Date('2026-10-10T10:00:00Z'), eventEndsAt: new Date('2026-10-10T09:00:00Z') }),
    ).toEqual(['news.errors.endBeforeStart'])
  })

  it('rejects an end without a start', () => {
    expect(validateNewsDraft({ title: 't', body: 'b', eventStartsAt: null, eventEndsAt: new Date() })).toEqual(['news.errors.endWithoutStart'])
  })
})
