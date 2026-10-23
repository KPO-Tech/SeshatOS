import { describe, expect, it } from 'vitest'
import { citedRefs, prepareAnswer, refOfHref } from './answerText'

const known = new Set(['k7f3a91', 'kc91b04'])

describe('prepareAnswer', () => {
  it('turns a known reference into a citation link', () => {
    expect(prepareAnswer('Sixty days. [k7f3a91] Thirty for logistics. [kc91b04]', known)).toBe('Sixty days. [•](#cite-k7f3a91) Thirty for logistics. [•](#cite-kc91b04)')
  })

  it('drops a reference that matches no excerpt', () => {
    expect(prepareAnswer('Sixty days. [kdeadbe] Done.', known)).toBe('Sixty days. Done.')
  })

  it('keeps references written one after the other', () => {
    expect(prepareAnswer('Both agree. [k7f3a91][kc91b04]', known)).toBe('Both agree. [•](#cite-k7f3a91) [•](#cite-kc91b04)')
  })

  it('holds back a reference that is still being written', () => {
    expect(prepareAnswer('Sixty days. [', known)).toBe('Sixty days.')
    expect(prepareAnswer('Sixty days. [k7f3', known)).toBe('Sixty days.')
    expect(prepareAnswer('Sixty days. [k7f3a91', known)).toBe('Sixty days.')
  })

  it('leaves text without references alone, and ordinary links', () => {
    expect(prepareAnswer('See [the page](https://example.com).', known)).toBe('See [the page](https://example.com).')
    expect(prepareAnswer('', known)).toBe('')
  })
})

describe('citedRefs', () => {
  it('lists each reference once, in order', () => {
    expect(citedRefs('A [kc91b04] B [k7f3a91] C [kc91b04]')).toEqual(['kc91b04', 'k7f3a91'])
    expect(citedRefs('Nothing cited.')).toEqual([])
  })
})

describe('refOfHref', () => {
  it('reads the reference of a citation link only', () => {
    expect(refOfHref('#cite-k7f3a91')).toBe('k7f3a91')
    expect(refOfHref('https://example.com')).toBeNull()
    expect(refOfHref(undefined)).toBeNull()
  })
})
