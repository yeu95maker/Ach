import { isoDateInTimeZone } from './dates'
import type { ISODate } from './types'

export type ChatMessage = {
  id: string
  unitId: string
  authorUserId: string | null
  authorEmployeeId: string | null
  author: { firstName: string; lastName: string; avatarPath: string | null; jobTitle: string | null } | null
  /** null once deleted by the author or hidden by a moderator */
  body: string | null
  createdAt: Date
  editedAt: Date | null
  deletedAt: Date | null
  hiddenAt: Date | null
}

export type ChatSummary = {
  unitId: string
  hospitalId: string
  unitName: string
  unitCode: string | null
  /** false when the chat is open to me as moderator only (e.g. PDL) */
  isMember: boolean
  lastMessageAt: Date | null
  unreadCount: number
}

export type TimelineItem =
  | { kind: 'day'; key: string; date: ISODate }
  | { kind: 'unread'; key: string }
  | { kind: 'message'; key: string; message: ChatMessage; own: boolean; groupStart: boolean; groupEnd: boolean }

/** Messages of the same author within this gap form one visual group. */
const GROUP_GAP_MS = 5 * 60_000

export const MAX_MESSAGE_LENGTH = 2000

export const isRemoved = (m: ChatMessage) => !!(m.deletedAt || m.hiddenAt)

/**
 * Turns messages (any order) into a render list, oldest first: day separators,
 * a "new messages" marker before the first of the `unreadCount` newest
 * messages from other people, and author groups.
 */
export function buildTimeline(messages: readonly ChatMessage[], opts: { myUserId: string; timeZone: string; unreadCount?: number }): TimelineItem[] {
  const sorted = [...messages].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id))

  // The unread marker sits before the N-th newest foreign message.
  let unreadFrom: string | null = null
  if (opts.unreadCount && opts.unreadCount > 0) {
    const foreign = sorted.filter((m) => m.authorUserId !== opts.myUserId && !isRemoved(m))
    unreadFrom = foreign[Math.max(0, foreign.length - opts.unreadCount)]?.id ?? null
  }

  const items: TimelineItem[] = []
  let lastDay: ISODate | null = null
  sorted.forEach((m, i) => {
    const day = isoDateInTimeZone(m.createdAt, opts.timeZone)
    if (day !== lastDay) {
      items.push({ kind: 'day', key: `day-${day}`, date: day })
      lastDay = day
    }
    if (m.id === unreadFrom) items.push({ kind: 'unread', key: 'unread' })
    const prev = sorted[i - 1]
    const next = sorted[i + 1]
    const sameGroup = (a: ChatMessage | undefined, b: ChatMessage | undefined) =>
      !!a &&
      !!b &&
      a.authorUserId === b.authorUserId &&
      Math.abs(b.createdAt.getTime() - a.createdAt.getTime()) <= GROUP_GAP_MS &&
      isoDateInTimeZone(a.createdAt, opts.timeZone) === isoDateInTimeZone(b.createdAt, opts.timeZone) &&
      b.id !== unreadFrom &&
      a.id !== unreadFrom
    items.push({
      kind: 'message',
      key: m.id,
      message: m,
      own: m.authorUserId === opts.myUserId,
      groupStart: !sameGroup(prev, m) || m.id === unreadFrom,
      groupEnd: !sameGroup(m, next) || next?.id === unreadFrom,
    })
  })
  return items
}

/** Newest-first pages from the server → one de-duplicated list. */
export function mergePages(pages: readonly (readonly ChatMessage[])[]): ChatMessage[] {
  const byId = new Map<string, ChatMessage>()
  for (const page of pages) for (const m of page) byId.set(m.id, m)
  return [...byId.values()]
}

export const totalUnread = (chats: readonly ChatSummary[] | undefined) => (chats ?? []).reduce((n, c) => n + c.unreadCount, 0)
