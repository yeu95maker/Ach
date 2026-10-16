/// <reference types="node" />
import { describe, expect, it, vi } from 'vitest'
import { apnsJwt, apnsRequest, fcmAccessToken, fcmAssertion, fcmRequest, sendApns, sendFcm, type ApnsConfig, type PushMessage } from './nativePush.ts'

const msg: PushMessage = { title: 'Dienst geändert', body: 'Station 3A', url: '/schedule', tag: 'schedule_changed' }

function pem(der: ArrayBuffer, label: string) {
  const b64 = Buffer.from(der).toString('base64').replace(/(.{64})/g, '$1\n')
  return `-----BEGIN ${label}-----\n${b64}\n-----END ${label}-----\n`
}

function decode(part: string) {
  return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'))
}

async function ecKey() {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
  return { pem: pem(await crypto.subtle.exportKey('pkcs8', pair.privateKey), 'PRIVATE KEY'), publicKey: pair.publicKey }
}

async function rsaKey() {
  const pair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify'])
  return { pem: pem(await crypto.subtle.exportKey('pkcs8', pair.privateKey), 'PRIVATE KEY'), publicKey: pair.publicKey }
}

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

describe('APNs', () => {
  it('signs a verifiable ES256 provider token', async () => {
    const k = await ecKey()
    const jwt = await apnsJwt({ keyP8: k.pem, keyId: 'ABC123DEFG', teamId: 'TEAM123456' }, 1_700_000_000)
    const [h, c, s] = jwt.split('.')
    expect(decode(h!)).toEqual({ alg: 'ES256', kid: 'ABC123DEFG' })
    expect(decode(c!)).toEqual({ iss: 'TEAM123456', iat: 1_700_000_000 })
    const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, k.publicKey, Buffer.from(s!, 'base64url'), new TextEncoder().encode(`${h}.${c}`))
    expect(ok).toBe(true)
  })

  const cfg: ApnsConfig = { keyP8: '', keyId: 'K', teamId: 'T', topic: 'app.dienstwerk', production: false }

  it('builds the request without health data', () => {
    const { url, init } = apnsRequest(cfg, 'a1b2', msg, 'jwt')
    expect(url).toBe('https://api.sandbox.push.apple.com/3/device/a1b2')
    expect(apnsRequest({ ...cfg, production: true }, 'a1b2', msg, 'jwt').url).toBe('https://api.push.apple.com/3/device/a1b2')
    expect(init.headers['apns-topic']).toBe('app.dienstwerk')
    expect(init.headers['apns-push-type']).toBe('alert')
    expect(init.headers.authorization).toBe('bearer jwt')
    expect(JSON.parse(init.body)).toEqual({ aps: { alert: { title: msg.title, body: msg.body }, sound: 'default', 'thread-id': msg.tag }, url: '/schedule' })
  })

  it('classifies responses', async () => {
    const f = vi.fn()
    f.mockResolvedValueOnce(new Response(null, { status: 200 }))
    expect(await sendApns(cfg, 't', msg, 'jwt', f)).toEqual({ outcome: 'sent' })
    f.mockResolvedValueOnce(json(410, { reason: 'Unregistered' }))
    expect((await sendApns(cfg, 't', msg, 'jwt', f)).outcome).toBe('invalid_token')
    f.mockResolvedValueOnce(json(400, { reason: 'BadDeviceToken' }))
    expect((await sendApns(cfg, 't', msg, 'jwt', f)).outcome).toBe('invalid_token')
    f.mockResolvedValueOnce(json(429, { reason: 'TooManyRequests' }))
    expect(await sendApns(cfg, 't', msg, 'jwt', f)).toEqual({ outcome: 'retry', detail: '429 TooManyRequests' })
    f.mockRejectedValueOnce(new Error('network down'))
    expect((await sendApns(cfg, 't', msg, 'jwt', f)).outcome).toBe('retry')
  })
})

describe('FCM HTTP v1', () => {
  it('signs a verifiable RS256 service-account assertion', async () => {
    const k = await rsaKey()
    const sa = { project_id: 'shiftcare-test', client_email: 'push@shiftcare-test.iam.gserviceaccount.com', private_key: k.pem }
    const jwt = await fcmAssertion(sa, 1_700_000_000)
    const [h, c, s] = jwt.split('.')
    expect(decode(h!)).toEqual({ alg: 'RS256', typ: 'JWT' })
    expect(decode(c!)).toEqual({
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat: 1_700_000_000,
      exp: 1_700_003_600,
    })
    const ok = await crypto.subtle.verify({ name: 'RSASSA-PKCS1-v1_5' }, k.publicKey, Buffer.from(s!, 'base64url'), new TextEncoder().encode(`${h}.${c}`))
    expect(ok).toBe(true)
  })

  it('exchanges the assertion for an access token', async () => {
    const k = await rsaKey()
    const f = vi.fn().mockResolvedValue(json(200, { access_token: 'ya29.token', expires_in: 3599 }))
    const token = await fcmAccessToken({ project_id: 'p', client_email: 'e', private_key: k.pem }, f)
    expect(token).toBe('ya29.token')
    const [url, init] = f.mock.calls[0]!
    expect(url).toBe('https://oauth2.googleapis.com/token')
    const form = new URLSearchParams(init.body)
    expect(form.get('grant_type')).toBe('urn:ietf:params:oauth:grant-type:jwt-bearer')
    expect(form.get('assertion')?.split('.')).toHaveLength(3)
    f.mockResolvedValueOnce(json(401, { error: 'invalid_grant' }))
    await expect(fcmAccessToken({ project_id: 'p', client_email: 'e', private_key: k.pem }, f)).rejects.toThrow(/401/)
  })

  it('builds the message and classifies responses', async () => {
    const { url, init } = fcmRequest('shiftcare-test', 'tok', msg, 'at')
    expect(url).toBe('https://fcm.googleapis.com/v1/projects/shiftcare-test/messages:send')
    expect(init.headers.authorization).toBe('Bearer at')
    expect(JSON.parse(init.body).message).toMatchObject({ token: 'tok', notification: { title: msg.title, body: msg.body }, data: { url: '/schedule' } })

    const f = vi.fn()
    f.mockResolvedValueOnce(json(200, { name: 'projects/p/messages/1' }))
    expect(await sendFcm('p', 'tok', msg, 'at', f)).toEqual({ outcome: 'sent' })
    f.mockResolvedValueOnce(json(404, { error: { status: 'NOT_FOUND', details: [{ errorCode: 'UNREGISTERED' }] } }))
    expect((await sendFcm('p', 'tok', msg, 'at', f)).outcome).toBe('invalid_token')
    f.mockResolvedValueOnce(json(400, { error: { status: 'INVALID_ARGUMENT' } }))
    expect((await sendFcm('p', 'tok', msg, 'at', f)).outcome).toBe('retry')
    f.mockResolvedValueOnce(json(503, { error: { status: 'UNAVAILABLE' } }))
    expect(await sendFcm('p', 'tok', msg, 'at', f)).toEqual({ outcome: 'retry', detail: '503 UNAVAILABLE' })
  })
})
