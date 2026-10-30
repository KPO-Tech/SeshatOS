import { describe, expect, it } from 'vitest'
import { storeSections } from './storeSections'
import type { StoreApp } from './storeCatalog'

const app = (id: string, extra: Partial<StoreApp> = {}): StoreApp => ({ id, name: id, tagline: '', description: '', ...extra })

describe('storeSections', () => {
  it('shows the featured app once, apart from the lists', () => {
    const sections = storeSections([app('a', { featured: true }), app('b'), app('c', { route: '/c' })])
    expect(sections.featured?.id).toBe('a')
    expect(sections.available.map((item) => item.id)).toEqual(['c'])
    expect(sections.soon.map((item) => item.id)).toEqual(['b'])
  })

  it('has no featured app when none is flagged', () => {
    const sections = storeSections([app('a'), app('b', { route: '/b' })])
    expect(sections.featured).toBeNull()
    expect(sections.available.map((item) => item.id)).toEqual(['b'])
    expect(sections.soon.map((item) => item.id)).toEqual(['a'])
  })

  it('keeps a featured app out of the lists even without a route', () => {
    const sections = storeSections([app('a', { featured: true })])
    expect(sections.available).toEqual([])
    expect(sections.soon).toEqual([])
  })
})
