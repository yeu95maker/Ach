import { createHash, timingSafeEqual } from 'node:crypto'

/**
 * Paynow (paynow.co.zw) wire protocol, mirroring the official Node SDK (paynow@2.2.2):
 * requests are form posts whose values are encodeURI()'d; every message carries
 * `hash` = SHA-512 (upper-case hex) of all other values in order + the integration key.
 */
export type Fields = [string, string][]

export const PAID_STATUSES = ['paid', 'awaiting delivery', 'delivered']
export const FAILED_STATUSES = ['cancelled', 'failed', 'disputed', 'refunded']

export function paynowHash(fields: Fields, integrationKey: string): string {
  const joined = fields.filter(([k]) => k.toLowerCase() !== 'hash').map(([, v]) => v).join('')
  return createHash('sha512').update(joined + integrationKey.toLowerCase(), 'utf8').digest('hex').toUpperCase()
}

/** Body for initiatetransaction / remotetransaction. */
export function buildRequest(values: Record<string, string>, integrationKey: string): URLSearchParams {
  const fields: Fields = Object.entries(values).map(([k, v]) => [k, encodeURI(v)])
  const body = new URLSearchParams(fields)
  body.append('hash', paynowHash(fields, integrationKey))
  return body
}

/** Parses a Paynow response / status update (key=value&…), keeping the field order. */
export function parseMessage(text: string): Fields {
  const decode = (s: string) => decodeURIComponent(s.replace(/%(?![\da-f]{2})/gi, '%25').replace(/\+/g, '%20'))
  return text
    .replace(/^\?/, '')
    .split('&')
    .filter(Boolean)
    .map((pair) => {
      const i = pair.indexOf('=')
      return (i < 0 ? [decode(pair), ''] : [decode(pair.slice(0, i)), decode(pair.slice(i + 1))]) as [string, string]
    })
}

export function verifyHash(fields: Fields, integrationKey: string): boolean {
  const received = fields.find(([k]) => k.toLowerCase() === 'hash')?.[1] ?? ''
  const expected = paynowHash(fields, integrationKey)
  return received.length === expected.length && timingSafeEqual(Buffer.from(received), Buffer.from(expected))
}

export const toRecord = (fields: Fields): Record<string, string> =>
  Object.fromEntries(fields.map(([k, v]) => [k.toLowerCase(), v]))

/** Zimbabwean mobile number in the local format Paynow expects (07XXXXXXXX), or null. */
export function normalizeZimPhone(input: string): string | null {
  const digits = input.replace(/[^\d+]/g, '')
  const local = digits.startsWith('+263') ? `0${digits.slice(4)}` : digits.startsWith('263') ? `0${digits.slice(3)}` : digits
  return /^07[1378]\d{7}$/.test(local) ? local : null
}

/** Unique merchant reference, e.g. PF-LZ3K9Q-7H2M. */
export function newReference(now = Date.now(), random = Math.random()): string {
  return `PF-${now.toString(36).toUpperCase()}-${Math.floor(random * 36 ** 4).toString(36).toUpperCase().padStart(4, '0')}`
}
