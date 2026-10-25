import { describe, expect, it } from 'vitest'
import { FULL_EDITION, PUBLIC_EDITION } from '@renderer/lib/edition'
import { hiddenConfigSections } from './configSections'

describe('hiddenConfigSections', () => {
  it('hides Knowledge, Connectors and SeshatCloud in the public edition', () => {
    expect(hiddenConfigSections(PUBLIC_EDITION)).toEqual(['knowledge', 'connectors', 'cloud'])
  })

  it('hides nothing in the full edition, the one every build has unless a release asks for the public one', () => {
    expect(hiddenConfigSections(FULL_EDITION)).toEqual([])
  })

  it('hides a section only when its own flag is off', () => {
    expect(hiddenConfigSections({ ...FULL_EDITION, knowledge: false })).toEqual(['knowledge', 'connectors'])
    expect(hiddenConfigSections({ ...FULL_EDITION, cloud: false })).toEqual(['cloud'])
  })

  // Reading scanned documents is a local feature of every edition: its section must never be one an edition hides.
  it('never hides the sections of the local features', () => {
    for (const edition of [PUBLIC_EDITION, FULL_EDITION]) {
      const hidden: string[] = hiddenConfigSections(edition)
      for (const id of ['documents', 'titles', 'audio', 'models', 'providers', 'storage']) expect(hidden).not.toContain(id)
    }
  })
})
