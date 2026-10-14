import type { MessageKey } from './i18n'

/** Database error codes (raised by the API functions/triggers) → user-facing message keys. */
const KNOWN: Record<string, MessageKey> = {
  PREMIUM_REQUIRED: 'error.premiumRequired',
  FAVORITES_LIMIT: 'error.favoritesLimit',
  PROVIDER_NOT_VERIFIED: 'error.providerNotVerified',
  ACCOUNT_SUSPENDED: 'error.accountSuspended',
  ALREADY_REPORTED: 'error.alreadyReported',
  OWN_PROPERTY: 'error.ownProperty',
  AUTH_REQUIRED: 'error.authRequired',
  DEMO_BILLING_DISABLED: 'error.billingDisabled',
  NOT_FOUND: 'error.notFound',
  TEAM_ADMIN_ONLY: 'error.teamAdminOnly',
  INVITE_INVALID: 'error.inviteInvalid',
  INVITE_OTHER_EMAIL: 'error.inviteOtherEmail',
  ALREADY_MEMBER: 'error.alreadyMember',
  'Invalid login credentials': 'error.invalidLogin',
  'User already registered': 'error.userExists',
}

export function errorKey(error: unknown): MessageKey {
  const message = typeof error === 'object' && error && 'message' in error ? String((error as { message: unknown }).message) : String(error ?? '')
  for (const [needle, key] of Object.entries(KNOWN)) if (message.includes(needle)) return key
  return 'error.generic'
}
