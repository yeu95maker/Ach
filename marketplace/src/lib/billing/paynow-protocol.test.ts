import { describe, expect, it } from 'vitest'
import { buildRequest, newReference, normalizeZimPhone, parseMessage, paynowHash, toRecord, verifyHash } from './paynow-protocol'

const KEY = '3e9fed89-60e1-4ce5-ab6e-6b1eb2d4f977'

describe('Paynow protocol', () => {
  it('hashes like the official SDK (SHA-512 of values + lower-cased key, upper-case hex)', () => {
    // Reference value computed with paynow@2.2.2 generateHash()
    expect(paynowHash([['id', '1201'], ['reference', 'TEST REF'], ['amount', '99.99'], ['status', 'Message']], KEY))
      .toBe('5D1D680F1D936F3712E90C05452D9B564317EA750C4E96E6C3DB81B3B33333E0A201B6CD6B77D92E0FB3F3BDDB93870761388A8BC04D056BF8F6CAA1DD60675F')
  })
  it('builds signed requests and verifies responses', () => {
    const body = buildRequest({ id: '1201', reference: 'PF-1', amount: '9.00', additionalinfo: 'Premium monthly', status: 'Message' }, KEY)
    expect(body.get('additionalinfo')).toBe('Premium%20monthly')
    const fields = [...body.entries()] as [string, string][]
    expect(verifyHash(fields, KEY)).toBe(true)
    expect(verifyHash(fields.map(([k, v]) => [k, k === 'amount' ? '0.01' : v]), KEY)).toBe(false)
  })
  it('parses status updates', () => {
    const fields: [string, string][] = [['reference', 'PF-1'], ['paynowreference', '123'], ['amount', '9.00'], ['status', 'Paid'], ['pollurl', 'https://www.paynow.co.zw/Interface/CheckPayment/?guid=abc']]
    const text = [...fields, ['hash', paynowHash(fields, KEY)]].map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')
    const parsed = parseMessage(text)
    expect(verifyHash(parsed, KEY)).toBe(true)
    expect(toRecord(parsed)).toMatchObject({ status: 'Paid', amount: '9.00', pollurl: 'https://www.paynow.co.zw/Interface/CheckPayment/?guid=abc' })
    expect(toRecord(parseMessage('status=Error&error=Invalid+Id.'))).toEqual({ status: 'Error', error: 'Invalid Id.' })
  })
  it('normalises Zimbabwean mobile numbers', () => {
    expect(normalizeZimPhone('+263 77 123 4567')).toBe('0771234567')
    expect(normalizeZimPhone('0712345678')).toBe('0712345678')
    expect(normalizeZimPhone('263781234567')).toBe('0781234567')
    expect(normalizeZimPhone('0242123456')).toBeNull()
    expect(normalizeZimPhone('12345')).toBeNull()
  })
  it('creates unique references', () => {
    expect(newReference(1_700_000_000_000, 0.5)).toMatch(/^PF-[0-9A-Z]+-[0-9A-Z]{4}$/)
  })
})
