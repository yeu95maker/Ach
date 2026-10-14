#!/usr/bin/env node
/**
 * Minimal Paynow stand-in for end-to-end tests – NOT for production.
 * Speaks the same signed form protocol as www.paynow.co.zw:
 *   POST /interface/initiatetransaction  → browserurl (+ pollurl)
 *   POST /interface/remotetransaction    → instructions (+ pollurl); mobile 0771111111 pays, 0773333333 cancels
 *   GET  /pay/:guid                      → test checkout page (Pay / Cancel → returnurl)
 *   POST /interface/checkpayment?guid=   → signed status
 * Status changes are also POSTed to the merchant's resulturl.
 *
 *   PAYNOW_INTEGRATION_KEY=… PAYNOW_MOCK_PORT=4010 node scripts/e2e/paynow-mock.mjs
 */
import { createHash, randomUUID } from 'node:crypto'
import { createServer } from 'node:http'

const PORT = Number(process.env.PAYNOW_MOCK_PORT ?? 4010)
const KEY = process.env.PAYNOW_INTEGRATION_KEY ?? 'test-key'
const BASE = `http://localhost:${PORT}`
const tx = new Map()

const hash = (pairs) => createHash('sha512').update(pairs.filter(([k]) => k !== 'hash').map(([, v]) => v).join('') + KEY.toLowerCase()).digest('hex').toUpperCase()
const signed = (pairs) => [...pairs, ['hash', hash(pairs)]].map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')
const readForm = (req) => new Promise((resolve) => {
  let data = ''
  req.on('data', (c) => (data += c))
  req.on('end', () => resolve([...new URLSearchParams(data).entries()]))
})
const statusPairs = (t) => [['reference', t.reference], ['paynowreference', t.paynowreference], ['amount', t.amount], ['status', t.status], ['pollurl', t.pollurl]]

async function setStatus(t, status) {
  t.status = status
  // Values were encodeURI()'d by the merchant; decode for the merchant-facing messages.
  await fetch(decodeURI(t.resulturl), { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: signed(statusPairs(t)) }).catch(() => {})
}

createServer(async (req, res) => {
  const url = new URL(req.url, BASE)
  const text = (status, body, type = 'text/plain') => { res.writeHead(status, { 'content-type': type }); res.end(body) }

  if (req.method === 'POST' && (url.pathname === '/interface/initiatetransaction' || url.pathname === '/interface/remotetransaction')) {
    const pairs = await readForm(req)
    if (hash(pairs) !== pairs.find(([k]) => k === 'hash')?.[1]) return text(200, 'status=Error&error=Invalid+Hash')
    const f = Object.fromEntries(pairs)
    const guid = randomUUID()
    const t = {
      guid, reference: decodeURI(f.reference), amount: decodeURI(f.amount), status: 'Sent', paynowreference: String(Math.floor(Math.random() * 1e7)),
      pollurl: `${BASE}/interface/checkpayment?guid=${guid}`, returnurl: f.returnurl, resulturl: f.resulturl,
    }
    tx.set(guid, t)
    if (url.pathname === '/interface/remotetransaction') {
      const phone = decodeURI(f.phone)
      setTimeout(() => setStatus(t, phone === '0773333333' ? 'Cancelled' : 'Paid'), 2500)
      return text(200, signed([['status', 'Ok'], ['instructions', 'Dial *151*2*4# if no prompt appears.'], ['paynowreference', t.paynowreference], ['pollurl', t.pollurl]]))
    }
    return text(200, signed([['status', 'Ok'], ['browserurl', `${BASE}/pay/${guid}`], ['pollurl', t.pollurl]]))
  }
  if (url.pathname.startsWith('/pay/')) {
    const t = tx.get(url.pathname.slice(5))
    if (!t) return text(404, 'unknown transaction')
    const action = url.searchParams.get('action')
    if (action) {
      await setStatus(t, action === 'pay' ? 'Paid' : 'Cancelled')
      res.writeHead(302, { location: decodeURI(t.returnurl) })
      return res.end()
    }
    return text(200, `<!doctype html><title>Paynow (test)</title><body style="font-family:sans-serif;padding:24px">
      <h1>Paynow test checkout</h1><p>Reference ${t.reference} – USD ${t.amount}</p>
      <a id="pay" href="?action=pay">Pay with test card</a> · <a href="?action=cancel">Cancel</a></body>`, 'text/html')
  }
  if (url.pathname === '/interface/checkpayment') {
    const t = tx.get(url.searchParams.get('guid'))
    if (!t) return text(200, 'status=Error&error=Not+found')
    return text(200, signed(statusPairs(t)))
  }
  text(404, 'not found')
}).listen(PORT, () => console.log(`paynow mock on ${BASE}`))
