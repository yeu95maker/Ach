import 'server-only'
import type { RenderedEmail } from './render'

/**
 * EMAIL_PROVIDER:
 *   resend – https://resend.com (RESEND_API_KEY, EMAIL_FROM e.g. "Property Finder <hello@your-domain>")
 *   log    – development: print instead of sending (counts as sent)
 *   unset  – emails stay queued in email_outbox until a provider is configured
 */
export type EmailProvider = 'resend' | 'log' | null

export function emailProvider(): EmailProvider {
  const p = process.env.EMAIL_PROVIDER
  if (p === 'resend' && process.env.RESEND_API_KEY && process.env.EMAIL_FROM) return 'resend'
  if (p === 'log') return 'log'
  return null
}

export async function sendEmail(to: string, email: RenderedEmail): Promise<void> {
  if (emailProvider() === 'log') {
    console.log(`[email] to=${to} subject=${email.subject}`)
    return
  }
  const res = await fetch(process.env.RESEND_API_URL ?? 'https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [to], subject: email.subject, html: email.html, text: email.text }),
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) throw new Error(`resend ${res.status}: ${(await res.text()).slice(0, 200)}`)
}
