import { BRAND } from '../brand'
import { createT, isLocale, type MessageKey } from '../i18n'

export interface OutboxRow {
  id: string
  kind: string
  params: Record<string, string | undefined>
  link: string | null
  to: string
  name: string
  locale: string
}

export interface RenderedEmail {
  subject: string
  text: string
  html: string
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Turns an outbox row into a localized, plain + HTML email. */
export function renderEmail(row: OutboxRow, siteUrl: string): RenderedEmail {
  const t = createT(isLocale(row.locale) ? row.locale : 'en')
  const p = { title: row.params.title ?? '', body: row.params.body ?? '', from: row.params.from || BRAND, provider: row.params.provider ?? '' }
  let subject: string
  let lines: string[]
  if (row.kind === 'new_message') {
    subject = t('email.newMessage', p)
    lines = [subject, `“${p.body}”`]
  } else if (row.kind === 'team_invite') {
    subject = t('email.teamInvite', { ...p, brand: BRAND })
    lines = [subject, t('email.teamInviteText')]
  } else {
    subject = t(`notification.${row.kind}` as MessageKey, p)
    lines = [subject, ...(p.body && !['favorite_price_drop', 'favorite_unavailable'].includes(row.kind) ? [p.body] : [])]
  }
  const url = row.link ? `${siteUrl}${row.link}` : siteUrl
  const action = t(row.kind === 'team_invite' ? 'email.join' : 'email.open', { brand: BRAND })
  const greeting = row.name ? t('email.hello', { name: row.name }) : t('email.helloAnon')
  const footer = row.kind === 'team_invite' ? '' : t('email.footer', { brand: BRAND })
  const text = [greeting, '', ...lines, '', `${action}: ${url}`, '', footer].join('\n').trim()
  const html = `<!doctype html><html><body style="margin:0;background:#f6f7f8;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#111827">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" style="max-width:520px;background:#fff;border-radius:16px;padding:24px" cellpadding="0" cellspacing="0">
<tr><td style="font-size:18px;font-weight:800;color:#0e523e;padding-bottom:16px">⌂ ${esc(BRAND)}</td></tr>
<tr><td style="font-size:15px;line-height:1.5">${esc(greeting)}</td></tr>
${lines.map((l, i) => `<tr><td style="font-size:15px;line-height:1.5;padding-top:12px;${i === 0 ? 'font-weight:700' : 'color:#374151'}">${esc(l)}</td></tr>`).join('')}
<tr><td style="padding-top:20px"><a href="${esc(url)}" style="display:inline-block;background:#12805e;color:#fff;text-decoration:none;font-weight:700;padding:12px 18px;border-radius:12px">${esc(action)}</a></td></tr>
${footer ? `<tr><td style="font-size:12px;color:#6b7280;padding-top:24px">${esc(footer)}</td></tr>` : ''}
</table></td></tr></table></body></html>`
  return { subject: subject.slice(0, 200), text, html }
}
