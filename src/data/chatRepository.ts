import type { ChatMessage, ChatSummary } from '@/domain/chat'
import { db, unwrap, unwrapList } from './client'

interface MessageRow {
  id: string
  unit_id: string
  author_user_id: string | null
  author_employee_id: string | null
  author_first_name: string | null
  author_last_name: string | null
  author_avatar_path: string | null
  author_job_title: string | null
  body: string | null
  created_at: string
  edited_at: string | null
  deleted_at: string | null
  hidden_at: string | null
}

interface ChatRow {
  unit_id: string
  hospital_id: string
  unit_name: string
  unit_code: string | null
  is_member: boolean
  last_message_at: string | null
  unread_count: number
}

const toDate = (v: string | null) => (v ? new Date(v) : null)

function mapMessage(r: MessageRow): ChatMessage {
  return {
    id: r.id,
    unitId: r.unit_id,
    authorUserId: r.author_user_id,
    authorEmployeeId: r.author_employee_id,
    author: r.author_first_name !== null ? { firstName: r.author_first_name, lastName: r.author_last_name ?? '', avatarPath: r.author_avatar_path, jobTitle: r.author_job_title } : null,
    body: r.body,
    createdAt: new Date(r.created_at),
    editedAt: toDate(r.edited_at),
    deletedAt: toDate(r.deleted_at),
    hiddenAt: toDate(r.hidden_at),
  }
}

export const PAGE_SIZE = 50

/** Stationschat: one conversation per ward. Writes only via RPCs (see 20261013000200_unit_chat.sql). */
export const chatRepository = {
  async listChats(): Promise<ChatSummary[]> {
    return unwrapList<ChatRow>(await db().rpc('my_unit_chats')).map((r) => ({
      unitId: r.unit_id,
      hospitalId: r.hospital_id,
      unitName: r.unit_name,
      unitCode: r.unit_code,
      isMember: r.is_member,
      lastMessageAt: toDate(r.last_message_at),
      unreadCount: r.unread_count,
    }))
  },

  /** Newest first; `before` pages further back. */
  async fetchMessages(unitId: string, before?: Date): Promise<ChatMessage[]> {
    const rows = unwrapList<MessageRow>(
      await db().rpc('get_unit_messages', { p_unit_id: unitId, p_before: before?.toISOString() ?? null, p_limit: PAGE_SIZE }),
    )
    return rows.map(mapMessage)
  },

  async send(unitId: string, body: string): Promise<void> {
    unwrap(await db().rpc('send_unit_message', { p_unit_id: unitId, p_body: body }))
  },

  async edit(messageId: string, body: string): Promise<void> {
    unwrap(await db().rpc('edit_unit_message', { p_message_id: messageId, p_body: body }))
  },

  async remove(messageId: string): Promise<void> {
    unwrap(await db().rpc('delete_unit_message', { p_message_id: messageId }))
  },

  async hide(messageId: string): Promise<void> {
    unwrap(await db().rpc('hide_unit_message', { p_message_id: messageId }))
  },

  async markRead(unitId: string): Promise<void> {
    unwrap(await db().rpc('mark_unit_chat_read', { p_unit_id: unitId }))
  },

  /** Live inserts/edits/removals in one ward chat (RLS applies to Realtime). */
  subscribe(unitId: string, onChange: () => void): () => void {
    const channel = db()
      .channel(`unit-chat:${unitId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'unit_messages', filter: `unit_id=eq.${unitId}` }, () => onChange())
      .subscribe()
    return () => {
      void db().removeChannel(channel)
    }
  },
}
