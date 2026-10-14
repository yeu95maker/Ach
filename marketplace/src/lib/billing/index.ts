import 'server-only'

/**
 * Billing mode:
 *   paynow – real payments via Paynow (EcoCash, OneMoney, Visa/Mastercard, ZimSwitch)
 *   demo   – Premium without payment (development/staging; needs app_settings.demo_billing)
 *   none   – upgrade shows "coming soon"
 */
export type BillingMode = 'paynow' | 'demo' | 'none'

export function billingMode(): BillingMode {
  const configured = process.env.BILLING_PROVIDER ?? 'demo'
  if (configured === 'paynow') return paynowConfigured() ? 'paynow' : 'none'
  return configured === 'demo' ? 'demo' : 'none'
}

export function paynowConfigured(): boolean {
  return !!(process.env.PAYNOW_INTEGRATION_ID && process.env.PAYNOW_INTEGRATION_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY)
}
