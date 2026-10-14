import 'server-only'
import { buildRequest, parseMessage, toRecord, verifyHash } from './paynow-protocol'

const BASE = (process.env.PAYNOW_BASE_URL ?? 'https://www.paynow.co.zw').replace(/\/$/, '')

function config() {
  const id = process.env.PAYNOW_INTEGRATION_ID
  const key = process.env.PAYNOW_INTEGRATION_KEY
  if (!id || !key) throw new Error('Paynow is not configured')
  return { id, key }
}

export const paynowKey = () => config().key

export type MobileMethod = 'ecocash' | 'onemoney'

export interface InitiateInput {
  reference: string
  amount: number
  description: string
  email: string
  returnUrl: string
  resultUrl: string
  /** Express checkout: USSD/PIN prompt on the customer's phone */
  mobile?: { method: MobileMethod; phone: string }
}

export type InitiateResult =
  | { ok: true; pollUrl: string; browserUrl?: string; instructions?: string }
  | { ok: false; error: string }

async function post(url: string, body?: URLSearchParams) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
    cache: 'no-store',
    signal: AbortSignal.timeout(20_000),
  })
  return parseMessage(await res.text())
}

export async function initiate(input: InitiateInput): Promise<InitiateResult> {
  const { id, key } = config()
  const values: Record<string, string> = {
    resulturl: input.resultUrl,
    returnurl: input.returnUrl,
    reference: input.reference,
    amount: input.amount.toFixed(2),
    id,
    additionalinfo: input.description,
    // Paynow test integrations only accept the merchant's own email here.
    authemail: process.env.PAYNOW_TEST_AUTH_EMAIL || input.email,
  }
  if (input.mobile) {
    values.phone = input.mobile.phone
    values.method = input.mobile.method
  }
  values.status = 'Message'
  const endpoint = input.mobile ? '/interface/remotetransaction' : '/interface/initiatetransaction'
  const fields = await post(`${BASE}${endpoint}`, buildRequest(values, key))
  const r = toRecord(fields)
  if (r.status?.toLowerCase() !== 'ok') return { ok: false, error: r.error || 'Paynow rejected the payment' }
  if (!verifyHash(fields, key)) return { ok: false, error: 'Invalid Paynow response signature' }
  return { ok: true, pollUrl: r.pollurl, browserUrl: r.browserurl || undefined, instructions: r.instructions || undefined }
}

export interface PaynowStatus {
  reference: string
  paynowReference: string
  amount: number
  status: string
}

/** Asks Paynow for the authoritative status. Only Paynow poll URLs are fetched (no SSRF). */
export async function poll(pollUrl: string): Promise<PaynowStatus> {
  const target = new URL(pollUrl)
  if (target.origin !== new URL(BASE).origin) throw new Error('Unexpected poll URL')
  const fields = await post(target.toString())
  if (!verifyHash(fields, config().key)) throw new Error('Invalid Paynow status signature')
  const r = toRecord(fields)
  return { reference: r.reference, paynowReference: r.paynowreference, amount: Number(r.amount), status: (r.status ?? '').toLowerCase() }
}
