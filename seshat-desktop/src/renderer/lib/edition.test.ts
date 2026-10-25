import { describe, expect, it } from 'vitest'
import { editionFor, FULL_EDITION, PUBLIC_EDITION } from './edition'

describe('editionFor', () => {
  it('shows everything unless the public edition is asked for by name', () => {
    expect(editionFor(undefined)).toBe(FULL_EDITION)
    expect(editionFor('')).toBe(FULL_EDITION)
    // The name of the old second edition: it is the only one now.
    expect(editionFor('next')).toBe(FULL_EDITION)
  })

  it('hides everything for the public edition', () => {
    expect(editionFor('public')).toBe(PUBLIC_EDITION)
    expect(Object.values(PUBLIC_EDITION).every((on) => on === false)).toBe(true)
  })

  it('has every flag on in the full edition, so a new flag cannot be forgotten off', () => {
    expect(Object.values(FULL_EDITION).every((on) => on === true)).toBe(true)
    expect(Object.keys(FULL_EDITION).sort()).toEqual(Object.keys(PUBLIC_EDITION).sort())
  })
})
