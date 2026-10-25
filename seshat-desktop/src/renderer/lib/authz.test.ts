import { describe, expect, it } from 'vitest'
import { canManageKnowledge, hasAdminAccess } from './authz'

describe('canManageKnowledge', () => {
  it('lets the person of a device of their own manage Knowledge, with no role at all', () => {
    // The local "continue without an account" session has no roles by design.
    expect(canManageKnowledge([], 'standalone')).toBe(true)
    expect(canManageKnowledge(null, 'standalone')).toBe(true)
  })

  it('lets an individual SeshatCloud account, which belongs to no organization, manage its own Knowledge', () => {
    expect(canManageKnowledge([], 'connected')).toBe(true)
    expect(canManageKnowledge(null, 'connected')).toBe(true)
  })

  it('holds a member of an organization to the roles of that organization', () => {
    expect(canManageKnowledge(['member'], 'connected')).toBe(false)
    expect(canManageKnowledge(['Admin'], 'connected')).toBe(true)
    expect(canManageKnowledge([' owner '], 'connected')).toBe(true)
  })

  it('lets only an administrator in while the mode is not known yet', () => {
    expect(canManageKnowledge([], null)).toBe(false)
    expect(canManageKnowledge(['admin'], null)).toBe(true)
  })

  it('still reads admin and owner whatever their case', () => {
    expect(hasAdminAccess(['OWNER'])).toBe(true)
    expect(hasAdminAccess(['member'])).toBe(false)
  })
})
