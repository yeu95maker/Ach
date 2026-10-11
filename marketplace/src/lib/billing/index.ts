import 'server-only'

/**
 * Billing is payment-provider agnostic. The database owns the membership
 * lifecycle (Free → Premium → Renewal → Cancellation → Expiration):
 *
 *   public.billing_record_payment  – a successful (renewal) payment extends the period (service role, idempotent)
 *   public.billing_mark_status     – past_due / expired reported by the provider (service role)
 *   public.cancel_membership       – user cancels at period end
 *   public.resume_membership       – user undoes the cancellation before the period ends
 *   public.expire_memberships      – cron: flags ended periods (premium checks use the end date anyway)
 *
 * To launch, implement a PaymentAdapter for the provider customers actually use
 * in the launch market (see docs/BILLING.md) and register it below.
 */
export type BillingMode = 'demo' | 'none' | 'provider'

export interface CheckoutRequest {
  userId: string
  email: string
  interval: 'month' | 'year'
  amount: number
  currency: string
  returnUrl: string
}

export interface VerifiedPaymentEvent {
  type: 'payment_succeeded' | 'payment_failed' | 'subscription_ended'
  userId: string
  interval: 'month' | 'year'
  reference: string
  amount: number
  currency: string
  externalCustomerId?: string
  externalSubscriptionId?: string
}

export interface PaymentAdapter {
  id: string
  /** Returns the URL of the provider's hosted checkout page. */
  createCheckout(req: CheckoutRequest): Promise<{ redirectUrl: string }>
  /** Verifies the webhook signature and normalises the event; null = ignore. */
  parseWebhook(request: Request): Promise<VerifiedPaymentEvent | null>
}

const adapters: Record<string, PaymentAdapter> = {
  // e.g. paynow: paynowAdapter, stripe: stripeAdapter
}

export function billingMode(): BillingMode {
  const configured = process.env.BILLING_PROVIDER ?? 'demo'
  if (configured === 'demo' || configured === 'none') return configured
  return adapters[configured] ? 'provider' : 'none'
}

export function paymentAdapter(): PaymentAdapter | null {
  return adapters[process.env.BILLING_PROVIDER ?? ''] ?? null
}
