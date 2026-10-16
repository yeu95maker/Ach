import 'server-only'
import { headers } from 'next/headers'
import { isNativeUserAgent } from './index'

/** True when the request comes from the iOS/Android app. */
export async function isNativeApp(): Promise<boolean> {
  return isNativeUserAgent((await headers()).get('user-agent'))
}
