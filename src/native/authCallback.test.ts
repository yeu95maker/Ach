import { describe, expect, it } from 'vitest'
import { nativeRedirect, parseAuthCallback } from './authCallback'

describe('native auth callback', () => {
  it('builds redirect targets', () => {
    expect(nativeRedirect()).toBe('shiftcare://auth-callback')
    expect(nativeRedirect('/reset-password')).toBe('shiftcare://auth-callback/reset-password')
  })

  it('reads the PKCE code and the target page', () => {
    expect(parseAuthCallback('shiftcare://auth-callback?code=abc')).toEqual({ code: 'abc', next: '/', error: null })
    expect(parseAuthCallback('shiftcare://auth-callback/reset-password?code=xyz')).toEqual({ code: 'xyz', next: '/reset-password', error: null })
  })

  it('reports errors from query or hash', () => {
    expect(parseAuthCallback('shiftcare://auth-callback?error=access_denied&error_description=Link+expired')?.error).toBe('Link expired')
    expect(parseAuthCallback('shiftcare://auth-callback#error=otp_expired')?.error).toBe('otp_expired')
  })

  it('never leads to arbitrary pages', () => {
    expect(parseAuthCallback('shiftcare://auth-callback/admin?code=a')?.next).toBe('/')
    expect(parseAuthCallback('shiftcare://auth-callback//evil.example?code=a')?.next).toBe('/')
  })

  it('ignores foreign links', () => {
    expect(parseAuthCallback('https://example.com/?code=a')).toBeNull()
    expect(parseAuthCallback('shiftcare://other?code=a')).toBeNull()
    expect(parseAuthCallback('not a url')).toBeNull()
  })
})
