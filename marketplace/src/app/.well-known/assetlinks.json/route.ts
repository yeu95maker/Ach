import { NextResponse } from 'next/server'
import { NATIVE_APP_ID } from '@/lib/native'

/**
 * Android app links: lets the app open https links to this site.
 * ANDROID_CERT_SHA256 = SHA-256 fingerprint(s) of the app signing key
 * (Play Console → Test and release → App integrity), comma-separated.
 */
export function GET() {
  const fingerprints = (process.env.ANDROID_CERT_SHA256 ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  const body = fingerprints.length
    ? [{ relation: ['delegate_permission/common.handle_all_urls'], target: { namespace: 'android_app', package_name: NATIVE_APP_ID, sha256_cert_fingerprints: fingerprints } }]
    : []
  return NextResponse.json(body, { headers: { 'cache-control': 'public, max-age=3600' } })
}
