'use client'
import { PriceText } from './PriceText'
import { ArrowLeft, BadgeCheck, SendHorizontal } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { errorKey } from '@/lib/errors'
import { formatDate, formatTime } from '@/lib/format'
import { useI18n } from '@/lib/i18n/client'
import { imageUrl } from '@/lib/images'
import { supabaseBrowser } from '@/lib/supabase/client'
import type { ConversationSummary, Message } from '@/lib/types'
import { toast } from './Toaster'

/**
 * Conversation linked to one property. New messages arrive via Supabase
 * Realtime; if the realtime channel is unavailable we poll every 10 s.
 */
export function Chat({ conversation: c, initial, userId }: { conversation: ConversationSummary; initial: Message[]; userId: string }) {
  const { t, locale } = useI18n()
  const router = useRouter()
  const [messages, setMessages] = useState<Message[]>(initial)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const bottom = useRef<HTMLDivElement>(null)
  const supabase = supabaseBrowser()

  const merge = useCallback((incoming: Message[]) => {
    setMessages((list) => {
      const byId = new Map(list.map((m) => [m.id, m]))
      for (const m of incoming) byId.set(m.id, m)
      return [...byId.values()].sort((a, b) => a.created_at.localeCompare(b.created_at))
    })
  }, [])

  const refresh = useCallback(async () => {
    const { data } = await supabase.from('messages').select('id, conversation_id, sender_id, body, created_at')
      .eq('conversation_id', c.id).order('created_at', { ascending: true }).limit(500)
    if (data) merge(data as Message[])
  }, [c.id, merge, supabase])

  useEffect(() => {
    let live = false
    const channel = supabase
      .channel(`conversation:${c.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${c.id}` },
        (payload) => merge([payload.new as Message]))
      .subscribe((status) => {
        live = status === 'SUBSCRIBED'
      })
    const poll = setInterval(() => {
      if (!live) void refresh()
    }, 10_000)
    return () => {
      clearInterval(poll)
      void supabase.removeChannel(channel)
    }
  }, [c.id, merge, refresh, supabase])

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' })
    void supabase.rpc('mark_conversation_read', { p_id: c.id })
  }, [messages.length, c.id, supabase])

  async function send(e: React.FormEvent) {
    e.preventDefault()
    const body = text.trim()
    if (!body) return
    setSending(true)
    const { data, error } = await supabase.from('messages').insert({ conversation_id: c.id, sender_id: userId, body })
      .select('id, conversation_id, sender_id, body, created_at').single()
    setSending(false)
    if (error) return toast({ text: t(errorKey(error)), tone: 'error' })
    setText('')
    merge([data as Message])
    router.refresh()
  }

  const counterpart = c.role === 'customer' ? c.provider.name : c.customer_name
  const cover = imageUrl(c.property.cover_image)

  return (
    <div className="-mx-4 -mt-4 flex h-[calc(100dvh-3.5rem-4.5rem)] flex-col bg-white md:mx-auto md:mt-0 md:h-[calc(100dvh-7rem)] md:max-w-2xl md:rounded-2xl md:ring-1 md:ring-gray-200">
      <header className="border-b border-gray-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <Link href="/messages" aria-label={t('common.back')} className="-ml-2 rounded-full p-2 hover:bg-gray-100"><ArrowLeft className="size-5" /></Link>
          <p className="font-bold text-gray-900">
            {counterpart}
            {c.role === 'customer' && c.provider.verified && <BadgeCheck className="ml-1 inline size-4 text-brand-600" aria-label={t('provider.verified')} />}
          </p>
        </div>
        <Link href={`/properties/${c.property.id}`} className="mt-2 flex items-center gap-3 rounded-xl bg-gray-50 p-2 ring-1 ring-gray-200">
          <div className="size-11 shrink-0 overflow-hidden rounded-lg bg-gray-200">{cover && <img src={cover} alt="" className="h-full w-full object-cover" />}</div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-gray-900">🏠 {c.property.title}</p>
            <p className="text-sm font-bold text-gray-700"><PriceText amount={c.property.price} currency={c.property.currency} transaction={c.property.transaction} /></p>
          </div>
        </Link>
      </header>

      <div className="flex-1 space-y-2 overflow-y-auto px-4 py-4" aria-live="polite">
        {messages.map((m, i) => {
          const mine = m.sender_id === userId
          const day = formatDate(m.created_at, locale)
          const showDay = i === 0 || day !== formatDate(messages[i - 1].created_at, locale)
          return (
            <div key={m.id}>
              {showDay && <p className="my-3 text-center text-xs font-medium text-gray-400">{day}</p>}
              <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-[15px] ${mine ? 'rounded-br-md bg-brand-600 text-white' : 'rounded-bl-md bg-gray-100 text-gray-900'}`}>
                  <p className="whitespace-pre-line">{m.body}</p>
                  <p className={`mt-0.5 text-right text-[11px] ${mine ? 'text-brand-100' : 'text-gray-500'}`}>{formatTime(m.created_at, locale)}</p>
                </div>
              </div>
            </div>
          )
        })}
        <div ref={bottom} />
      </div>

      <form onSubmit={send} className="flex items-end gap-2 border-t border-gray-100 p-3">
        <label htmlFor="message" className="sr-only">{t('message.yourMessage')}</label>
        <textarea id="message" rows={1} value={text} onChange={(e) => setText(e.target.value)} maxLength={4000} placeholder={t('message.typePlaceholder')}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              e.currentTarget.form?.requestSubmit()
            }
          }}
          className="max-h-32 min-h-11 flex-1 resize-none rounded-2xl bg-gray-100 px-4 py-2.5 text-[15px] focus:ring-2 focus:ring-brand-600 focus:outline-none" />
        <button type="submit" disabled={sending || !text.trim()} aria-label={t('message.send')}
          className="flex size-11 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white disabled:bg-gray-300">
          <SendHorizontal className="size-5" />
        </button>
      </form>
    </div>
  )
}
