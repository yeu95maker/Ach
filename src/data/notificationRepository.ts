import type { AppNotification } from '@/domain/types'
import { db, unwrap, unwrapList } from './client'
import { mapNotification } from './mappers'
import type { NotificationRow } from './rows'

const PAGE_SIZE = 30

export const notificationRepository = {
  async fetchPage(before?: Date): Promise<AppNotification[]> {
    let query = db()
      .from('notifications')
      .select('id, type, payload, entity_type, entity_id, read_at, created_at')
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE)
    if (before) query = query.lt('created_at', before.toISOString())
    return unwrapList<NotificationRow>(await query).map(mapNotification)
  },

  pageSize: PAGE_SIZE,

  async markRead(ids: string[] | null): Promise<void> {
    unwrap(await db().rpc('mark_notifications_read', { p_ids: ids }))
  },

  /** Realtime stream of new notifications for the signed-in user (RLS applies). */
  subscribe(userId: string, onInsert: (n: AppNotification) => void): () => void {
    const channel = db()
      .channel(`notifications:${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `recipient_id=eq.${userId}` },
        (payload) => onInsert(mapNotification(payload.new as NotificationRow)),
      )
      .subscribe()
    return () => {
      void db().removeChannel(channel)
    }
  },

  async registerWebPush(subscription: PushSubscriptionJSON, deviceName: string): Promise<void> {
    if (!subscription.endpoint || !subscription.keys) return
    unwrap(
      await db().rpc('register_device_token', {
        p_platform: 'web',
        p_token: subscription.endpoint,
        p_web_push_keys: subscription.keys,
        p_device_name: deviceName,
        p_app_version: __APP_VERSION__,
      }),
    )
  },

  async unregisterDevice(token: string): Promise<void> {
    unwrap(await db().from('device_tokens').delete().eq('token', token))
  },
}

export async function countUnreadNotifications(): Promise<number> {
  const { count, error } = await db().from('notifications').select('id', { count: 'exact', head: true }).is('read_at', null)
  if (error) throw error
  return count ?? 0
}
