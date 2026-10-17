import { describe, expect, it } from 'vitest'
import { hasAdminAccess } from './authz'
import { modelAlias } from './modelAlias'
import { isUntitledSessionTitle } from './sessionTitle'

describe('hasAdminAccess', () => {
  it.each([[['admin']], [['Owner']], [[' ADMIN ']], [['member', 'owner']]])('grants %j', (roles) => {
    expect(hasAdminAccess(roles)).toBe(true)
  })

  it.each([[['member']], [['administrator']], [[]], [null], [undefined]])('refuses %j', (roles) => {
    expect(hasAdminAccess(roles)).toBe(false)
  })
})

describe('modelAlias', () => {
  it('strips a vendor prefix', () => {
    expect(modelAlias('anthropic/claude-3.7-sonnet')).toBe('claude-3.7-sonnet')
    expect(modelAlias('Anthropic: Claude 3.7 Sonnet')).toBe('Claude 3.7 Sonnet')
  })

  it('leaves a plain name alone', () => {
    expect(modelAlias('  gpt-5 ')).toBe('gpt-5')
    expect(modelAlias('claude-sonnet-5-5')).toBe('claude-sonnet-5-5')
  })
})

describe('isUntitledSessionTitle', () => {
  it.each([undefined, null, '', '  ', 'Unnamed session', 'Untitled conversation', 'New chat', 'untitled_session_42'])('treats %j as untitled', (title) => {
    expect(isUntitledSessionTitle(title)).toBe(true)
  })

  it('keeps a real title', () => {
    expect(isUntitledSessionTitle('Quarterly report')).toBe(false)
  })
})
