import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import type { ShiftSwap } from '@/domain/swaps'

/**
 * Warnings come as own_rest / own_wish (the requester) and partner_rest /
 * partner_wish. Shown as "you" to the person concerned, by name to everyone else.
 */
export function useWarningText() {
  const { t } = useTranslation()
  return useCallback(
    (w: string, swap?: Pick<ShiftSwap, 'role' | 'requesterName' | 'partnerName'>, partnerName?: string) => {
      const [side, issue] = w.split('_') as ['own' | 'partner', 'rest' | 'wish']
      const isMe = swap ? (side === 'own' ? swap.role === 'requester' : swap.role === 'partner') : side === 'own'
      if (isMe) return t(`swaps.warn.${issue}You`)
      const name = side === 'own' ? swap?.requesterName : (swap?.partnerName ?? partnerName)
      return t(`swaps.warn.${issue}`, { name: name ?? '' })
    },
    [t],
  )
}
