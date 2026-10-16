import { NextResponse } from 'next/server'
import { APP_LINK_PATHS, NATIVE_APP_ID } from '@/lib/native'

/**
 * iOS universal links: lets the app open https links to this site.
 * Needs APPLE_TEAM_ID (developer.apple.com → Membership); without it the file is empty.
 */
export function GET() {
  const team = process.env.APPLE_TEAM_ID
  const details = team ? [{ appIDs: [`${team}.${NATIVE_APP_ID}`], components: APP_LINK_PATHS.map((path) => ({ '/': path })) }] : []
  return NextResponse.json({ applinks: { details } }, { headers: { 'cache-control': 'public, max-age=3600' } })
}
