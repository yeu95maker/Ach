'use client'
import { Trash2, UserPlus } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { errorKey } from '@/lib/errors'
import { formatDate } from '@/lib/format'
import { useI18n } from '@/lib/i18n/client'
import { supabaseBrowser } from '@/lib/supabase/client'
import { CopyLink } from './CopyLink'
import { toast } from './Toaster'
import { Badge, Button, Card, Input, Select } from './ui'

export interface TeamData {
  my_role: 'owner' | 'admin' | 'agent'
  members: { user_id: string; role: 'owner' | 'admin' | 'agent'; email: string; name: string | null; since: string }[]
  invites: { id: string; email: string; role: 'admin' | 'agent'; token: string; created_at: string }[]
}

export function Team({ data }: { data: TeamData }) {
  const { t, locale } = useI18n()
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'agent' | 'admin'>('agent')
  const [busy, setBusy] = useState(false)
  const canManage = data.my_role === 'owner' || data.my_role === 'admin'
  const supabase = supabaseBrowser()

  async function call(fn: string, args: Record<string, unknown>, done: string) {
    setBusy(true)
    const { error } = await supabase.rpc(fn, args)
    setBusy(false)
    if (error) return toast({ text: t(errorKey(error)), tone: 'error' })
    toast({ text: done, tone: 'success' })
    router.refresh()
  }

  return (
    <div className="space-y-5">
      {canManage && (
        <Card className="p-5">
          <h2 className="mb-1 font-bold">{t('team.invite')}</h2>
          <p className="mb-3 text-sm text-gray-600">{t('team.inviteText')}</p>
          <form className="grid gap-2 sm:grid-cols-[1fr_9rem_auto]" onSubmit={async (e) => {
            e.preventDefault()
            await call('team_invite', { p_email: email, p_role: role }, t('team.invited', { email }))
            setEmail('')
          }}>
            <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="agent@agency.co.zw" aria-label={t('auth.email')} />
            <Select value={role} onChange={(e) => setRole(e.target.value as 'agent' | 'admin')} aria-label={t('team.role')}>
              <option value="agent">{t('team.role.agent')}</option>
              <option value="admin">{t('team.role.admin')}</option>
            </Select>
            <Button type="submit" disabled={busy}><UserPlus className="size-4" />{t('team.send')}</Button>
          </form>
          <p className="mt-2 text-xs text-gray-500">{t('team.rolesExplained')}</p>
        </Card>
      )}

      <Card className="divide-y divide-gray-100">
        {data.members.map((m) => (
          <div key={m.user_id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
            <div className="min-w-0">
              <p className="font-semibold">{m.name || m.email}</p>
              <p className="text-sm text-gray-500">{m.email} · {t('team.since', { date: formatDate(m.since, locale) })}</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge tone={m.role === 'owner' ? 'green' : m.role === 'admin' ? 'blue' : 'gray'}>{t(`team.role.${m.role}`)}</Badge>
              {canManage && m.role !== 'owner' && (
                <button type="button" aria-label={t('team.remove')} disabled={busy} className="rounded-full p-2 text-gray-500 hover:bg-red-50 hover:text-red-700"
                  onClick={() => window.confirm(t('team.removeConfirm', { name: m.name || m.email })) && call('team_remove', { p_user: m.user_id }, t('common.saved'))}>
                  <Trash2 className="size-4" />
                </button>
              )}
            </div>
          </div>
        ))}
      </Card>

      {canManage && data.invites.length > 0 && (
        <section>
          <h2 className="mb-2 font-bold">{t('team.pending')}</h2>
          <Card className="divide-y divide-gray-100">
            {data.invites.map((i) => (
              <div key={i.id} className="space-y-2 px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm"><span className="font-semibold">{i.email}</span> · {t(`team.role.${i.role}`)}</p>
                  <Button size="sm" variant="ghost" onClick={() => call('team_revoke_invite', { p_id: i.id }, t('common.saved'))}>{t('team.revoke')}</Button>
                </div>
                <CopyLink url={`/provider/join?token=${i.token}`} />
              </div>
            ))}
          </Card>
          <p className="mt-2 text-xs text-gray-500">{t('team.linkHint')}</p>
        </section>
      )}
    </div>
  )
}

export function JoinTeam({ token }: { token: string }) {
  const { t } = useI18n()
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  return (
    <Button size="lg" disabled={busy || !token} onClick={async () => {
      setBusy(true)
      const { error } = await supabaseBrowser().rpc('accept_provider_invite', { p_token: token })
      setBusy(false)
      if (error) return toast({ text: t(errorKey(error)), tone: 'error' })
      toast({ text: t('team.joined'), tone: 'success' })
      router.push('/provider')
      router.refresh()
    }}>{t('team.join')}</Button>
  )
}
