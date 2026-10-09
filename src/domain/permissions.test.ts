import { describe, expect, it } from 'vitest'
import { can, isManager, toPermissionSet } from './permissions'

describe('permissions', () => {
  it('ignores unknown permission keys from the backend', () => {
    const set = toPermissionSet(['leave.request', 'future.feature'])
    expect([...set]).toEqual(['leave.request'])
  })

  it('checks permissions of an employment', () => {
    const nurse = { permissions: toPermissionSet(['schedule.view', 'leave.request']) }
    const lead = { permissions: toPermissionSet(['schedule.view', 'leave.approve']) }
    expect(can(nurse, 'leave.approve')).toBe(false)
    expect(can(lead, 'leave.approve')).toBe(true)
    expect(can(null, 'schedule.view')).toBe(false)
    expect(isManager(nurse)).toBe(false)
    expect(isManager(lead)).toBe(true)
  })
})
