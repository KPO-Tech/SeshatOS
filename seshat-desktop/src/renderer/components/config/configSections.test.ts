import { describe, expect, it } from 'vitest'
import { FULL_EDITION, PUBLIC_EDITION } from '@renderer/lib/edition'
import { hiddenConfigSections } from './configSections'

describe('hiddenConfigSections', () => {
  it('hides SeshatCloud in the public edition', () => {
    expect(hiddenConfigSections(PUBLIC_EDITION)).toEqual(['cloud'])
  })

  it('hides nothing in the full edition, the one every build has unless a release asks for the public one', () => {
    expect(hiddenConfigSections(FULL_EDITION)).toEqual([])
  })

  // The sections of the local features stay, whatever the edition: the models Knowledge searches with are in Config > Search.
  it('never hides the sections of the local features', () => {
    for (const edition of [PUBLIC_EDITION, FULL_EDITION]) {
      const hidden: string[] = hiddenConfigSections(edition)
      for (const id of ['documents', 'search', 'titles', 'audio', 'models', 'providers', 'storage', 'mcp', 'environment', 'skills']) expect(hidden).not.toContain(id)
    }
  })
})
