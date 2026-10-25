import { describe, expect, it } from 'vitest'
import type { Edition } from '@renderer/lib/edition'
import { hiddenConfigSections } from './configSections'

const V1: Edition = { accounts: false, cloud: false, knowledge: false, store: false, knowledgeApp: false, sources: false }
const NEXT: Edition = { ...V1, store: true, knowledgeApp: true, sources: true }

describe('hiddenConfigSections', () => {
  it('hides Knowledge, Connectors and SeshatCloud in the public edition', () => {
    expect(hiddenConfigSections(V1)).toEqual(['knowledge', 'connectors', 'cloud'])
  })

  it('keeps them hidden in the next edition, which does not switch Knowledge on yet', () => {
    expect(hiddenConfigSections(NEXT)).toEqual(['knowledge', 'connectors', 'cloud'])
  })

  it('shows them when the edition switches them on', () => {
    expect(hiddenConfigSections({ ...V1, knowledge: true, cloud: true })).toEqual([])
  })

  // Reading scanned documents is a local feature of the public edition: its section must never be one an edition hides.
  it('never hides the sections of the local features', () => {
    for (const edition of [V1, NEXT]) {
      const hidden: string[] = hiddenConfigSections(edition)
      for (const id of ['documents', 'titles', 'audio', 'models', 'providers', 'storage']) expect(hidden).not.toContain(id)
    }
  })
})
