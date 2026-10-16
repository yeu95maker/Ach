import { describe, expect, it } from 'vitest'
import { isNativeUserAgent, NATIVE_UA_MARKER } from './index'

describe('isNativeUserAgent', () => {
  it('detects the app user agent', () => {
    expect(isNativeUserAgent(`Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 ${NATIVE_UA_MARKER}`)).toBe(true)
  })
  it('ignores browsers and missing headers', () => {
    expect(isNativeUserAgent('Mozilla/5.0 (Linux; Android 15) Chrome/130 Mobile Safari/537.36')).toBe(false)
    expect(isNativeUserAgent(null)).toBe(false)
  })
})
