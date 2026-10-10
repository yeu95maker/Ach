/**
 * Native push delivery: APNs (iOS, token-based auth) and FCM HTTP v1 (Android).
 *
 * Pure WebCrypto + fetch, so the same module runs in the Edge Function (Deno)
 * and in the unit tests (Node). `fetch` is injected for testability.
 *
 * Official endpoints:
 *  - APNs:  https://developer.apple.com/documentation/usernotifications/sending-notification-requests-to-apns
 *  - FCM:   https://firebase.google.com/docs/reference/fcm/rest/v1/projects.messages/send
 */

export type PushMessage = { title: string; body: string; url: string; tag: string }
export type SendResult = { outcome: 'sent' } | { outcome: 'invalid_token'; detail: string } | { outcome: 'retry'; detail: string }
type Fetch = typeof fetch

const enc = new TextEncoder()

function b64url(data: ArrayBuffer | Uint8Array | string): string {
  const bytes = typeof data === 'string' ? enc.encode(data) : data instanceof Uint8Array ? data : new Uint8Array(data)
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function pemToDer(pem: string): ArrayBuffer {
  const body = pem.replace(/-----(BEGIN|END) [A-Z ]+-----/g, '').replace(/\s+/g, '')
  const raw = atob(body)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out.buffer
}

async function signJwt(header: object, claims: object, key: CryptoKey, algorithm: AlgorithmIdentifier | EcdsaParams): Promise<string> {
  const input = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claims))}`
  // WebCrypto ECDSA returns the raw r||s form that JWS ES256 expects.
  const sig = await crypto.subtle.sign(algorithm, key, enc.encode(input))
  return `${input}.${b64url(sig)}`
}

// ---------------------------------------------------------------------------
// APNs
// ---------------------------------------------------------------------------

export type ApnsConfig = {
  /** Contents of the AuthKey_XXXXXXXXXX.p8 file (PKCS#8 PEM). */
  keyP8: string
  keyId: string
  teamId: string
  /** Bundle identifier, e.g. dev.shiftcare.app */
  topic: string
  /** false → api.sandbox.push.apple.com (development builds). */
  production: boolean
}

/** Provider token, valid for up to 60 minutes (Apple rejects older ones). */
export async function apnsJwt(cfg: Pick<ApnsConfig, 'keyP8' | 'keyId' | 'teamId'>, nowSeconds = Math.floor(Date.now() / 1000)) {
  const key = await crypto.subtle.importKey('pkcs8', pemToDer(cfg.keyP8), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
  return signJwt({ alg: 'ES256', kid: cfg.keyId }, { iss: cfg.teamId, iat: nowSeconds }, key, { name: 'ECDSA', hash: 'SHA-256' })
}

export function apnsRequest(cfg: ApnsConfig, deviceToken: string, msg: PushMessage, jwt: string) {
  const host = cfg.production ? 'https://api.push.apple.com' : 'https://api.sandbox.push.apple.com'
  return {
    url: `${host}/3/device/${encodeURIComponent(deviceToken)}`,
    init: {
      method: 'POST',
      headers: {
        authorization: `bearer ${jwt}`,
        'apns-topic': cfg.topic,
        'apns-push-type': 'alert',
        'apns-priority': '10',
        'apns-expiration': String(Math.floor(Date.now() / 1000) + 3600),
        'apns-collapse-id': msg.tag.slice(0, 64),
        'content-type': 'application/json',
      },
      body: JSON.stringify({ aps: { alert: { title: msg.title, body: msg.body }, sound: 'default', 'thread-id': msg.tag }, url: msg.url }),
    } satisfies RequestInit,
  }
}

/** Reasons for which the token will never work again → remove the device. */
const APNS_DEAD = new Set(['BadDeviceToken', 'Unregistered', 'DeviceTokenNotForTopic'])

export async function sendApns(cfg: ApnsConfig, deviceToken: string, msg: PushMessage, jwt: string, f: Fetch = fetch): Promise<SendResult> {
  const { url, init } = apnsRequest(cfg, deviceToken, msg, jwt)
  let res: Response
  try {
    res = await f(url, init)
  } catch (e) {
    return { outcome: 'retry', detail: String(e) }
  }
  if (res.status === 200) return { outcome: 'sent' }
  const reason = await res
    .json()
    .then((j: { reason?: string }) => j.reason ?? '')
    .catch(() => '')
  if (res.status === 410 || APNS_DEAD.has(reason)) return { outcome: 'invalid_token', detail: `${res.status} ${reason}` }
  return { outcome: 'retry', detail: `${res.status} ${reason}` }
}

// ---------------------------------------------------------------------------
// FCM HTTP v1
// ---------------------------------------------------------------------------

export type FcmServiceAccount = { project_id: string; client_email: string; private_key: string; token_uri?: string }

const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging'
const GOOGLE_TOKEN_URI = 'https://oauth2.googleapis.com/token'

/** Signed JWT assertion for the OAuth 2.0 service-account flow (RFC 7523). */
export async function fcmAssertion(sa: FcmServiceAccount, nowSeconds = Math.floor(Date.now() / 1000)) {
  const key = await crypto.subtle.importKey('pkcs8', pemToDer(sa.private_key), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'])
  return signJwt(
    { alg: 'RS256', typ: 'JWT' },
    { iss: sa.client_email, scope: FCM_SCOPE, aud: sa.token_uri ?? GOOGLE_TOKEN_URI, iat: nowSeconds, exp: nowSeconds + 3600 },
    key,
    { name: 'RSASSA-PKCS1-v1_5' },
  )
}

export async function fcmAccessToken(sa: FcmServiceAccount, f: Fetch = fetch): Promise<string> {
  const res = await f(sa.token_uri ?? GOOGLE_TOKEN_URI, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: await fcmAssertion(sa) }).toString(),
  })
  if (!res.ok) throw new Error(`FCM auth failed: ${res.status} ${await res.text().catch(() => '')}`.slice(0, 500))
  const json = (await res.json()) as { access_token?: string }
  if (!json.access_token) throw new Error('FCM auth: no access_token')
  return json.access_token
}

export function fcmRequest(projectId: string, deviceToken: string, msg: PushMessage, accessToken: string) {
  return {
    url: `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/messages:send`,
    init: {
      method: 'POST',
      headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        message: {
          token: deviceToken,
          notification: { title: msg.title, body: msg.body },
          data: { url: msg.url, tag: msg.tag },
          android: { priority: 'HIGH', ttl: '3600s', collapse_key: msg.tag, notification: { tag: msg.tag } },
        },
      }),
    } satisfies RequestInit,
  }
}

export async function sendFcm(projectId: string, deviceToken: string, msg: PushMessage, accessToken: string, f: Fetch = fetch): Promise<SendResult> {
  const { url, init } = fcmRequest(projectId, deviceToken, msg, accessToken)
  let res: Response
  try {
    res = await f(url, init)
  } catch (e) {
    return { outcome: 'retry', detail: String(e) }
  }
  if (res.ok) return { outcome: 'sent' }
  const err = await res
    .json()
    .then((j: { error?: { status?: string; details?: { errorCode?: string }[] } }) => j.error)
    .catch(() => undefined)
  const code = err?.details?.find((d) => d.errorCode)?.errorCode ?? err?.status ?? ''
  // UNREGISTERED: app uninstalled or token rotated. Anything else (incl. INVALID_ARGUMENT) is retried
  // and ends as 'failed' – we never delete a device because of a payload problem.
  if (res.status === 404 || code === 'UNREGISTERED') return { outcome: 'invalid_token', detail: `${res.status} ${code}` }
  return { outcome: 'retry', detail: `${res.status} ${code}` }
}
