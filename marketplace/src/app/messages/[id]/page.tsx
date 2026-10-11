import { notFound } from 'next/navigation'
import { Chat } from '@/components/Chat'
import { requireAccount } from '@/lib/account'
import { createClient } from '@/lib/supabase/server'
import type { ConversationSummary, Message } from '@/lib/types'

export default async function ConversationPage({ params }: PageProps<'/messages/[id]'>) {
  const { id } = await params
  const account = await requireAccount(`/messages/${id}`)
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()
  const supabase = await createClient()
  const [conv, msgs] = await Promise.all([
    supabase.rpc('get_conversation', { p_id: id }),
    supabase.from('messages').select('id, conversation_id, sender_id, body, created_at').eq('conversation_id', id).order('created_at', { ascending: true }).limit(500),
  ])
  const conversation = conv.data as ConversationSummary | null
  if (!conversation) notFound()
  return <Chat conversation={conversation} initial={(msgs.data as Message[] | null) ?? []} userId={account.id} />
}
