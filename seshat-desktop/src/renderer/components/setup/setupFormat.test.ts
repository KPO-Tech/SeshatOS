import { describe, expect, it } from 'vitest'
import { defaultChoices, fitsOnDisk, formatBytes, totalDownloadBytes } from './setupFormat'

const plan = {
  components: [
    { id: 'title' as const, available: true, options: [{ id: 'a', sizeBytes: 491_000_000, recommended: true }, { id: 'b', sizeBytes: 253_000_000, recommended: false }] },
    { id: 'speech' as const, available: true, options: [{ id: 'tiny', sizeBytes: 78_000_000, recommended: false }, { id: 'base', sizeBytes: 148_000_000, recommended: true }] }
  ]
}

describe('setup choices', () => {
  it('starts on the recommended model of each component, ticked', () => {
    expect(defaultChoices(plan)).toEqual({ title: { install: true, modelId: 'a' }, speech: { install: true, modelId: 'base' } })
  })

  it('leaves out a component that is not available', () => {
    expect(defaultChoices({ components: [{ ...plan.components[0], available: false }, plan.components[1]] })).toEqual({ speech: { install: true, modelId: 'base' } })
  })

  it('offers a component the computer is better without, but unticked', () => {
    const withScans = {
      components: [...plan.components, { id: 'ocr' as const, available: true, defaultOn: false, options: [{ id: 'latin', sizeBytes: 101_000_000, recommended: true }] }]
    }
    const choices = defaultChoices(withScans)
    expect(choices.ocr).toEqual({ install: false, modelId: 'latin' })
    // It counts for nothing until the person ticks it, then for its own size.
    expect(totalDownloadBytes(withScans, choices)).toBe(639_000_000)
    expect(totalDownloadBytes(withScans, { ...choices, ocr: { install: true, modelId: 'latin' } })).toBe(740_000_000)
  })

  it('ticks a component that says nothing about the computer', () => {
    const withScans = { components: [{ id: 'ocr' as const, available: true, defaultOn: true, options: [{ id: 'latin', sizeBytes: 1, recommended: true }] }] }
    expect(defaultChoices(withScans).ocr?.install).toBe(true)
  })

  it('adds up what is ticked, and nothing for what is not', () => {
    expect(totalDownloadBytes(plan, defaultChoices(plan))).toBe(639_000_000)
    expect(totalDownloadBytes(plan, { title: { install: false, modelId: 'a' }, speech: { install: true, modelId: 'tiny' } })).toBe(78_000_000)
    expect(totalDownloadBytes(plan, {})).toBe(0)
  })

  it('keeps a margin when it asks whether the download fits', () => {
    expect(fitsOnDisk(639_000_000, 100_000_000_000)).toBe(true)
    expect(fitsOnDisk(639_000_000, 1_000_000_000)).toBe(false)
    expect(fitsOnDisk(639_000_000, null)).toBe(true)
  })

  it('writes sizes the way a person reads them', () => {
    expect(formatBytes(491_400_032)).toBe('491 MB')
    expect(formatBytes(1_117_320_736)).toBe('1.1 GB')
    expect(formatBytes(0)).toBe('0 MB')
  })
})
