import { ArrowLeft, Eye, MessagesSquare, Pencil, SendHorizontal, ShieldCheck, Trash2, X } from 'lucide-react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useSearchParams } from 'react-router'
import { PersonAvatar } from '@/components/PersonAvatar'
import { QueryError } from '@/components/QueryState'
import { errorMessageKey, toAppError } from '@/core/errors'
import { buildTimeline, isRemoved, MAX_MESSAGE_LENGTH, type ChatMessage, type TimelineItem } from '@/domain/chat'
import { can } from '@/domain/permissions'
import { useCurrentUser, useEmployment } from '@/features/tenant/TenantProvider'
import { useHospitalFormatter } from '@/features/tenant/useHospitalFormatter'
import { Button, EmptyState, IconButton, ListGroup, ListRow, PageHeader, Select, Sheet, SkeletonCard, cn, useToast } from '@/ui'
import { useChatMessages, useChats, useEditMessage, useMarkRead, useRemoveMessage, useSendMessage } from './useChat'

/** Stationschat: one conversation per ward, for everyone working on it. */
export function ChatPage() {
  const { t } = useTranslation()
  const user = useCurrentUser()
  const employment = useEmployment()
  const fmt = useHospitalFormatter()
  const toast = useToast()
  const [params, setParams] = useSearchParams()
  const chats = useChats()

  const unitId = useMemo(() => {
    const list = chats.data ?? []
    const wanted = params.get('unit')
    if (wanted && list.some((c) => c.unitId === wanted)) return wanted
    const primary = employment.units.find((u) => u.isPrimary)?.id
    return list.find((c) => c.unitId === primary)?.unitId ?? list[0]?.unitId ?? null
  }, [chats.data, params, employment.units])
  const chat = chats.data?.find((c) => c.unitId === unitId) ?? null

  // Remember how many were unread when the chat was opened (marker position), before marking it read.
  const [unreadAtOpen, setUnreadAtOpen] = useState<{ unitId: string; count: number } | null>(null)
  if (chat && unreadAtOpen?.unitId !== chat.unitId) setUnreadAtOpen({ unitId: chat.unitId, count: chat.unreadCount })

  const messages = useChatMessages(unitId)
  const newest = useMemo(() => messages.messages.reduce<ChatMessage | undefined>((a, m) => (!a || m.createdAt > a.createdAt ? m : a), undefined), [messages.messages])
  useMarkRead(unitId, newest?.id)

  const timeline = useMemo(
    () => buildTimeline(messages.messages, { myUserId: user.id, timeZone: employment.hospital.timezone, unreadCount: unreadAtOpen?.count ?? 0 }),
    [messages.messages, user.id, employment.hospital.timezone, unreadAtOpen],
  )

  const moderator = can(employment, 'chat.moderate')
  const [selected, setSelected] = useState<ChatMessage | null>(null)
  const [editing, setEditing] = useState<ChatMessage | null>(null)
  const remove = useRemoveMessage(unitId)

  // Keep the newest message in view: on open, and when something new arrives while at the bottom.
  const stick = useRef(true)
  useEffect(() => {
    const onScroll = () => {
      stick.current = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 160
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  // Scroll to the very end of the page so the last message sits above the sticky composer and tab bar.
  // After layout settles (avatars, the unread marker), hence one frame later.
  useLayoutEffect(() => {
    if (!stick.current) return
    window.scrollTo({ top: document.documentElement.scrollHeight })
    const raf = requestAnimationFrame(() => window.scrollTo({ top: document.documentElement.scrollHeight }))
    return () => cancelAnimationFrame(raf)
  }, [newest?.id, unitId, timeline.length])

  const onError = (e: unknown) => toast.show({ tone: 'error', title: t('errors.title'), description: t(errorMessageKey(e)) })

  const back = (
    <Link to="/team" className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-primary-text hover:underline">
      <ArrowLeft className="size-4" aria-hidden />
      {t('team.title')}
    </Link>
  )

  if (chats.error) return <QueryError error={chats.error} onRetry={() => void chats.refetch()} />
  if (chats.isLoading) return <SkeletonCard lines={6} />
  if (!chat)
    return (
      <>
        {back}
        <PageHeader title={t('chat.title')} />
        <EmptyState icon={<MessagesSquare />} title={t('chat.noWard')} description={t('chat.noWardHint')} />
      </>
    )

  return (
    <div className="mx-auto max-w-3xl">
      {back}
      <PageHeader
        title={t('chat.title')}
        subtitle={chat.unitName}
        actions={
          (chats.data?.length ?? 0) > 1 ? (
            <Select aria-label={t('chat.ward')} value={chat.unitId} onChange={(e) => setParams({ unit: e.target.value }, { replace: true })} className="h-11 w-56 text-sm">
              {chats.data!.map((c) => (
                <option key={c.unitId} value={c.unitId}>
                  {c.unitName}
                  {c.unreadCount ? ` (${c.unreadCount})` : ''}
                </option>
              ))}
            </Select>
          ) : undefined
        }
      />

      {!chat.isMember && (
        <p className="mb-4 flex items-start gap-2 rounded-2xl bg-primary-soft px-4 py-3 text-sm text-primary-text">
          <Eye className="mt-0.5 size-4 shrink-0" aria-hidden />
          {t('chat.moderatorOnly')}
        </p>
      )}

      {messages.hasNextPage ? (
        <div className="mb-4 flex justify-center">
          <Button variant="ghost" size="sm" loading={messages.isFetchingNextPage} onClick={() => void messages.fetchNextPage()}>
            {t('chat.loadOlder')}
          </Button>
        </div>
      ) : (
        messages.data && (
          <p className="mx-auto mb-6 flex max-w-md items-start gap-2 rounded-2xl bg-surface-2/70 px-4 py-3 text-[13px] leading-relaxed text-text-2">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-text-3" aria-hidden />
            {t('chat.intro', { unit: chat.unitName })}
          </p>
        )
      )}

      {messages.error && <QueryError error={messages.error} onRetry={() => void messages.refetch()} />}
      {messages.isLoading && <SkeletonCard lines={5} />}
      {messages.data && messages.messages.length === 0 && <EmptyState compact icon={<MessagesSquare />} title={t('chat.empty')} description={t('chat.emptyHint')} />}

      <ol className="space-y-0.5" aria-label={t('chat.messages')} aria-live="polite">
        {timeline.map((item) => (
          <TimelineRow key={item.key} item={item} onSelect={setSelected} />
        ))}
      </ol>

      <Composer
        unitId={chat.unitId}
        editing={editing}
        onDoneEditing={() => setEditing(null)}
        onError={onError}
        placeholder={t('chat.placeholder', { unit: chat.unitCode ?? chat.unitName })}
      />

      <Sheet open={!!selected} onClose={() => setSelected(null)} title={t('chat.actions')} closeLabel={t('common.close')}>
        {selected && (
          <>
            <p className="mb-4 line-clamp-3 rounded-2xl bg-surface-2/70 px-4 py-3 text-sm whitespace-pre-wrap text-text-2">{selected.body}</p>
            <ListGroup>
              {selected.authorUserId === user.id && (
                <ListRow
                  icon={<Pencil />}
                  title={t('chat.edit')}
                  onClick={() => {
                    setEditing(selected)
                    setSelected(null)
                  }}
                />
              )}
              {selected.authorUserId === user.id && (
                <ListRow
                  icon={<Trash2 />}
                  tone="danger"
                  title={t('chat.delete')}
                  subtitle={t('chat.deleteHint')}
                  onClick={() =>
                    remove.mutateAsync({ id: selected.id, as: 'author' }).then(() => {
                      setSelected(null)
                      toast.show({ tone: 'success', title: t('chat.deleted') })
                    }, onError)
                  }
                />
              )}
              {selected.authorUserId !== user.id && moderator && (
                <ListRow
                  icon={<Eye />}
                  tone="danger"
                  title={t('chat.hide')}
                  subtitle={t('chat.hideHint')}
                  onClick={() =>
                    remove.mutateAsync({ id: selected.id, as: 'moderator' }).then(() => {
                      setSelected(null)
                      toast.show({ tone: 'success', title: t('chat.hidden') })
                    }, onError)
                  }
                />
              )}
            </ListGroup>
            <p className="mt-4 text-xs text-text-3">{t('chat.sentAt', { when: `${fmt.dateShort(isoDay(selected.createdAt, employment.hospital.timezone))}, ${fmt.time(selected.createdAt)}` })}</p>
          </>
        )}
      </Sheet>
    </div>
  )
}

const isoDay = (d: Date, timeZone: string) => new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)

function TimelineRow({ item, onSelect }: { item: TimelineItem; onSelect: (m: ChatMessage) => void }) {
  const { t } = useTranslation()
  const fmt = useHospitalFormatter()
  const employment = useEmployment()

  if (item.kind === 'day') {
    const today = isoDay(new Date(), employment.hospital.timezone)
    return (
      <li className="flex justify-center py-3">
        <span className="rounded-full bg-surface-2 px-3 py-1 text-xs font-semibold text-text-2">{item.date === today ? t('chat.today') : fmt.dateShort(item.date)}</span>
      </li>
    )
  }
  if (item.kind === 'unread') {
    return (
      <li className="flex items-center gap-3 py-3 text-xs font-semibold text-accent-text" role="separator">
        <span className="h-px flex-1 bg-accent/50" />
        {t('chat.newMessages')}
        <span className="h-px flex-1 bg-accent/50" />
      </li>
    )
  }

  const { message: m, own, groupStart, groupEnd } = item
  const removed = isRemoved(m)
  const name = m.author ? `${m.author.firstName} ${m.author.lastName}` : t('chat.formerMember')
  const canAct = !removed && (own || can(employment, 'chat.moderate'))
  const time = fmt.time(m.createdAt)

  return (
    <li className={cn('flex items-end gap-2', own ? 'justify-end' : 'justify-start', groupStart && 'pt-3')}>
      {!own && (
        <span className="w-9 shrink-0">
          {groupEnd && m.author && <PersonAvatar person={{ firstName: m.author.firstName, lastName: m.author.lastName, avatarPath: m.author.avatarPath }} size="sm" />}
        </span>
      )}
      <div className={cn('flex max-w-[78%] flex-col sm:max-w-[70%]', own ? 'items-end' : 'items-start')}>
        {groupStart && !own && <span className="mb-1 px-1 text-xs font-semibold text-text-2">{name}</span>}
        <button
          type="button"
          disabled={!canAct}
          onClick={() => onSelect(m)}
          aria-label={canAct ? t('chat.messageActions', { name: own ? t('chat.you') : name, time }) : undefined}
          className={cn(
            'rounded-[20px] px-4 py-2.5 text-left text-[15px] leading-snug whitespace-pre-wrap break-words transition-[filter] enabled:active:brightness-95 disabled:cursor-default',
            own ? 'bg-primary text-on-primary' : 'bg-surface text-text shadow-sm ring-1 ring-border/70',
            own ? (groupEnd ? 'rounded-br-md' : '') : groupEnd ? 'rounded-bl-md' : '',
            removed && 'bg-transparent text-text-3 italic shadow-none ring-1 ring-border',
          )}
        >
          {removed ? (m.hiddenAt ? t('chat.removedByLead') : t('chat.removedByAuthor')) : m.body}
        </button>
        {groupEnd && (
          <span className="mt-1 px-1 text-[11px] text-text-3">
            {time}
            {m.editedAt && !removed && ` · ${t('chat.edited')}`}
          </span>
        )}
      </div>
    </li>
  )
}

function Composer({
  unitId,
  editing,
  onDoneEditing,
  onError,
  placeholder,
}: {
  unitId: string
  editing: ChatMessage | null
  onDoneEditing: () => void
  onError: (e: unknown) => void
  placeholder: string
}) {
  const { t } = useTranslation()
  const toast = useToast()
  const send = useSendMessage(unitId)
  const edit = useEditMessage(unitId)
  const [text, setText] = useState('')
  const area = useRef<HTMLTextAreaElement>(null)

  // Editing loads the message into the composer.
  const [editingId, setEditingId] = useState<string | null>(null)
  if ((editing?.id ?? null) !== editingId) {
    setEditingId(editing?.id ?? null)
    setText(editing?.body ?? '')
  }
  useEffect(() => {
    if (editing) area.current?.focus()
  }, [editing])

  // Auto-grow up to ~6 lines.
  useLayoutEffect(() => {
    const el = area.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 168)}px`
  }, [text])

  const busy = send.isPending || edit.isPending
  const trimmed = text.trim()
  const tooLong = trimmed.length > MAX_MESSAGE_LENGTH

  const submit = (e?: FormEvent) => {
    e?.preventDefault()
    if (!trimmed || tooLong || busy) return
    const done = () => {
      setText('')
      if (editing) onDoneEditing()
      area.current?.focus()
    }
    const fail = (err: unknown) => (toAppError(err).kind === 'rate_limited' ? toast.show({ tone: 'warning', title: t('errors.rate_limited') }) : onError(err))
    if (editing) edit.mutateAsync({ id: editing.id, body: trimmed }).then(done, fail)
    else send.mutateAsync(trimmed).then(done, fail)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter sends on devices with a keyboard; Shift+Enter (and the phone keyboard's return key) adds a line.
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && window.matchMedia('(pointer: fine)').matches) submit()
  }

  return (
    <form
      onSubmit={submit}
      className="sticky bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-30 mt-4 rounded-[26px] border border-border/70 bg-surface/90 p-2 shadow-lg backdrop-blur-xl md:bottom-6"
    >
      {editing && (
        <div className="mb-1 flex items-center justify-between gap-2 px-3 pt-1 text-xs font-semibold text-primary-text">
          <span className="flex items-center gap-1.5">
            <Pencil className="size-3.5" aria-hidden />
            {t('chat.editing')}
          </span>
          <IconButton label={t('chat.cancelEdit')} variant="ghost" className="size-8" onClick={onDoneEditing}>
            <X className="size-4" />
          </IconButton>
        </div>
      )}
      <div className="flex items-end gap-2">
        <label htmlFor="chat-input" className="sr-only">
          {t('chat.messageLabel')}
        </label>
        <textarea
          id="chat-input"
          ref={area}
          rows={1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          maxLength={MAX_MESSAGE_LENGTH + 200}
          enterKeyHint="send"
          className="max-h-[168px] min-h-11 flex-1 resize-none bg-transparent px-3 py-2.5 text-[16px] leading-snug text-text outline-none placeholder:text-text-3"
        />
        <Button type="submit" aria-label={editing ? t('chat.save') : t('chat.send')} disabled={!trimmed || tooLong} loading={busy} className="size-11 shrink-0 rounded-full p-0">
          {!busy && <SendHorizontal className="size-5" aria-hidden />}
        </Button>
      </div>
      {trimmed.length > MAX_MESSAGE_LENGTH - 200 && (
        <p className={cn('px-3 pb-1 text-right text-xs', tooLong ? 'text-danger-text' : 'text-text-3')}>
          {trimmed.length} / {MAX_MESSAGE_LENGTH}
        </p>
      )}
    </form>
  )
}
