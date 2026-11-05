import { describe, expect, it } from 'vitest'
import { findSection, groupSections, SETTINGS_SECTIONS, visibleSections } from './sections'

describe('the sections of Settings', () => {
  it('lists each section once', () => {
    const ids = SETTINGS_SECTIONS.map((section) => section.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('leaves SeshatCloud out of an edition without the cloud', () => {
    expect(visibleSections({ cloud: false }).some((section) => section.id === 'cloud')).toBe(false)
    expect(visibleSections({ cloud: true }).some((section) => section.id === 'cloud')).toBe(true)
  })

  it('opens the first section for a name it does not know, or none', () => {
    expect(findSection('providers', { cloud: false }).id).toBe('providers')
    expect(findSection('nonsense', { cloud: false }).id).toBe('account')
    expect(findSection(undefined, { cloud: false }).id).toBe('account')
  })

  it('groups the sections in the order they are listed', () => {
    const groups = groupSections(visibleSections({ cloud: false }))
    expect(groups.map(([name]) => name)).toEqual(['general', 'aiRuntime', 'capabilities', 'workspace', 'dataPrivacy', 'about'])
    expect(groups[0][1].map((section) => section.id)).toEqual(['account', 'language-notifications', 'appearance', 'shortcuts'])
  })
})
