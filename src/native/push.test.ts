import { describe, expect, it, vi } from 'vitest'

vi.mock('@capacitor/push-notifications', () => ({ PushNotifications: {} }))
vi.mock('@capacitor/core', () => ({ Capacitor: { getPlatform: () => 'web' } }))

const { pushEnabledFor } = await import('./push')

describe('pushEnabledFor', () => {
  it('is off without a flag or outside the native shell', () => {
    expect(pushEnabledFor(undefined, 'ios')).toBe(false)
    expect(pushEnabledFor('', 'ios')).toBe(false)
    expect(pushEnabledFor('false', 'ios')).toBe(false)
    expect(pushEnabledFor('true', null)).toBe(false)
  })
  it('enables only the listed platforms', () => {
    expect(pushEnabledFor('ios', 'ios')).toBe(true)
    expect(pushEnabledFor('ios', 'android')).toBe(false)
    expect(pushEnabledFor('ios, android', 'android')).toBe(true)
    expect(pushEnabledFor('IOS', 'ios')).toBe(true)
  })
  it('"true" keeps meaning both platforms', () => {
    expect(pushEnabledFor('true', 'ios')).toBe(true)
    expect(pushEnabledFor('true', 'android')).toBe(true)
  })
})
