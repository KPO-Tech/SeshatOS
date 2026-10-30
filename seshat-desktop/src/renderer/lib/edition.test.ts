import { describe, expect, it } from 'vitest'
import { editionFor, FULL_EDITION, PUBLIC_EDITION } from './edition'

describe('editionFor', () => {
  it('shows everything unless the public edition is asked for by name', () => {
    expect(editionFor(undefined)).toBe(FULL_EDITION)
    expect(editionFor('')).toBe(FULL_EDITION)
    // The name of the old second edition: it is the only one now.
    expect(editionFor('next')).toBe(FULL_EDITION)
  })

  it('hides accounts and SeshatCloud for the public edition, and shows the rest', () => {
    expect(editionFor('public')).toBe(PUBLIC_EDITION)
    expect(PUBLIC_EDITION.accounts).toBe(false)
    expect(PUBLIC_EDITION.cloud).toBe(false)
    const shown = Object.entries(PUBLIC_EDITION).filter(([, on]) => on).map(([flag]) => flag)
    expect(shown.sort()).toEqual(['knowledge', 'knowledgeApp', 'sources', 'store'])
  })

  it('has every flag on in the full edition, so a new flag cannot be forgotten off', () => {
    expect(Object.values(FULL_EDITION).every((on) => on === true)).toBe(true)
    expect(Object.keys(FULL_EDITION).sort()).toEqual(Object.keys(PUBLIC_EDITION).sort())
  })
})
