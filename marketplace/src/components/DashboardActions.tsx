'use client'
import { useRouter } from 'next/navigation'
import { errorKey } from '@/lib/errors'
import { useI18n } from '@/lib/i18n/client'
import { supabaseBrowser } from '@/lib/supabase/client'
import type { DashboardProperty, PropertyStatus } from '@/lib/types'
import { toast } from './Toaster'
import { Button, LinkButton } from './ui'

export function DashboardActions({ p, stale }: { p: DashboardProperty; stale: boolean }) {
  const { t } = useI18n()
  const router = useRouter()
  const supabase = supabaseBrowser()

  async function setStatus(status: PropertyStatus, confirmKey?: Parameters<typeof t>[0]) {
    if (confirmKey && !window.confirm(t(confirmKey))) return
    const { error } = await supabase.from('properties').update({ status }).eq('id', p.id)
    if (error) return toast({ text: t(errorKey(error)), tone: 'error' })
    router.refresh()
  }
  async function confirmAvailable() {
    const { error } = await supabase.rpc('confirm_property_available', { p_id: p.id })
    if (error) return toast({ text: t(errorKey(error)), tone: 'error' })
    toast({ text: t('dashboard.confirmed'), tone: 'success' })
    router.refresh()
  }

  return (
    <div className="flex flex-wrap gap-2">
      <LinkButton href={`/provider/properties/${p.id}/edit`} size="sm" variant="secondary">{t('dashboard.edit')}</LinkButton>
      {p.status === 'active' && stale && <Button size="sm" onClick={confirmAvailable}>{t('dashboard.stillAvailable')}</Button>}
      {p.status === 'active' && <Button size="sm" variant="secondary" onClick={() => setStatus('sold', 'dashboard.soldConfirm')}>{t('dashboard.markSold')}</Button>}
      {p.status === 'pending' && <Button size="sm" variant="ghost" onClick={() => setStatus('draft')}>{t('dashboard.withdraw')}</Button>}
      {p.status !== 'sold' && <Button size="sm" variant="ghost" className="text-red-700 hover:bg-red-50" onClick={() => setStatus('removed', 'dashboard.removeConfirm')}>{t('dashboard.remove')}</Button>}
    </div>
  )
}
