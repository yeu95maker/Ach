import { describe, expect, it } from 'vitest'
import { buildTimeline, mergePages, totalUnread, type ChatMessage } from './chat'

const TZ = 'Europe/Berlin'
let n = 0
const msg = (author: string, iso: string, extra: Partial<ChatMessage> = {}): ChatMessage => ({
  id: `m${++n}`,
  unitId: 'u',
  authorUserId: author,
  authorEmployeeId: null,
  author: { firstName: author, lastName: 'X', avatarPath: null, jobTitle: null },
  body: 'hi',
  createdAt: new Date(iso),
  editedAt: null,
  deletedAt: null,
  hiddenAt: null,
  ...extra,
})

describe('chat timeline', () => {
  it('sorts, adds day separators in the hospital time zone and groups by author', () => {
    const a1 = msg('anna', '2026-10-10T08:00:00Z')
    const a2 = msg('anna', '2026-10-10T08:03:00Z')
    const j1 = msg('jonas', '2026-10-10T08:04:00Z')
    const a3 = msg('anna', '2026-10-10T08:30:00Z')
    // 23:30 UTC is already the next day in Berlin
    const late = msg('anna', '2026-10-10T22:30:00Z')
    const items = buildTimeline([late, a3, j1, a2, a1], { myUserId: 'anna', timeZone: TZ })
    expect(items.map((i) => (i.kind === 'message' ? i.message.id : i.kind === 'day' ? i.date : i.kind))).toEqual([
      '2026-10-10', a1.id, a2.id, j1.id, a3.id, '2026-10-11', late.id,
    ])
    const m = (id: string) => items.find((i) => i.kind === 'message' && i.message.id === id) as Extract<(typeof items)[number], { kind: 'message' }>
    expect([m(a1.id).groupStart, m(a1.id).groupEnd]).toEqual([true, false])
    expect([m(a2.id).groupStart, m(a2.id).groupEnd]).toEqual([false, true])
    expect(m(j1.id).own).toBe(false)
    expect(m(a3.id).groupStart).toBe(true) // 26 min later → new group
    expect(m(late.id).groupStart).toBe(true) // new day
  })

  it('puts the unread marker before the newest foreign messages', () => {
    const own = msg('anna', '2026-10-10T08:00:00Z')
    const j1 = msg('jonas', '2026-10-10T08:01:00Z')
    const j2 = msg('jonas', '2026-10-10T08:02:00Z')
    const removed = msg('jonas', '2026-10-10T08:03:00Z', { body: null, deletedAt: new Date() })
    const items = buildTimeline([own, j1, j2, removed], { myUserId: 'anna', timeZone: TZ, unreadCount: 1 })
    const keys = items.map((i) => i.key)
    expect(keys.indexOf('unread')).toBe(keys.indexOf(j2.id) - 1)
    const j2item = items.find((i) => i.key === j2.id) as Extract<(typeof items)[number], { kind: 'message' }>
    expect(j2item.groupStart).toBe(true) // a group never spans the marker
    expect(buildTimeline([own, j1], { myUserId: 'anna', timeZone: TZ, unreadCount: 0 }).some((i) => i.kind === 'unread')).toBe(false)
  })

  it('merges pages without duplicates and sums unread counts', () => {
    const a = msg('anna', '2026-10-10T08:00:00Z')
    const b = msg('anna', '2026-10-10T09:00:00Z')
    expect(mergePages([[b, a], [a]]).map((m) => m.id).sort()).toEqual([a.id, b.id].sort())
    expect(totalUnread([{ unreadCount: 2 }, { unreadCount: 3 }] as never)).toBe(5)
    expect(totalUnread(undefined)).toBe(0)
  })
})
