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

  // The settings of Knowledge (its models, its sources) are in the Knowledge page, and the agents are in the Skills page: Config does
  // not have those sections any more, whatever the edition.
  it('never hides the sections of the local features', () => {
    for (const edition of [PUBLIC_EDITION, FULL_EDITION]) {
      const hidden: string[] = hiddenConfigSections(edition)
      for (const id of ['documents', 'titles', 'audio', 'models', 'providers', 'storage', 'mcp', 'environment', 'skills']) expect(hidden).not.toContain(id)
    }
  })
})
