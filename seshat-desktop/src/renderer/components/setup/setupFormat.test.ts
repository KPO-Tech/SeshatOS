import { describe, expect, it } from 'vitest'
import { bytesToDownload, defaultChoices, fitsOnDisk, formatBytes, formatDuration, formatRate, overallProgress, remainingSeconds, totalDownloadBytes } from './setupFormat'

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

  it('counts the engine of a component that is not on this computer yet', () => {
    const withEngines = {
      components: [
        { ...plan.components[0], engineBytes: 19_000_000 },
        { ...plan.components[1], engineBytes: 0 }
      ]
    }
    expect(totalDownloadBytes(withEngines, defaultChoices(withEngines))).toBe(658_000_000)
    // An engine only counts for a component that is ticked.
    expect(totalDownloadBytes(withEngines, { title: { install: false, modelId: 'a' }, speech: { install: true, modelId: 'base' } })).toBe(148_000_000)
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

describe('overallProgress', () => {
  const choices = defaultChoices(plan)
  const item = (status: 'waiting' | 'running' | 'done' | 'error', receivedBytes = 0, totalBytes = 0) => ({ status, receivedBytes, totalBytes })

  it('is nothing before anything has arrived, out of the whole plan', () => {
    expect(overallProgress(plan, choices, {})).toEqual({ receivedBytes: 0, totalBytes: 639_000_000, percent: 0 })
  })

  it('counts each component for its share of the size the plan gave it', () => {
    // Half of the title model (491 MB) and none of the voice: 245 MB of 639 MB.
    const half = overallProgress(plan, choices, { title: item('running', 50, 100), speech: item('waiting') })
    expect(half.receivedBytes).toBe(245_500_000)
    expect(half.percent).toBe(38)
  })

  it('counts a finished component for all of its size, whatever it reported', () => {
    const state = overallProgress(plan, choices, { title: item('done', 1, 1), speech: item('running', 74_000_000, 148_000_000) })
    expect(state.receivedBytes).toBe(491_000_000 + 74_000_000)
    expect(state.percent).toBe(88)
  })

  it('leaves a component that failed out of the count, so the rest can reach 100', () => {
    const state = overallProgress(plan, choices, { title: item('error'), speech: item('done') })
    expect(state).toEqual({ receivedBytes: 148_000_000, totalBytes: 148_000_000, percent: 100 })
  })

  it('ignores a component that was not ticked, and never goes over 100', () => {
    const state = overallProgress(plan, { speech: { install: true, modelId: 'base' } }, { speech: item('running', 500, 100), title: item('done') })
    expect(state).toEqual({ receivedBytes: 148_000_000, totalBytes: 148_000_000, percent: 100 })
  })
})

describe('models already on the computer', () => {
  // The voice: base is the recommended one, small is already there and in use, tiny is already there too.
  const speech = (installed: Record<string, boolean>, active?: string) => ({
    id: 'speech' as const,
    available: true,
    options: [
      { id: 'tiny', sizeBytes: 78_000_000, recommended: false, installed: installed.tiny, active: active === 'tiny' },
      { id: 'base', sizeBytes: 148_000_000, recommended: true, installed: installed.base, active: active === 'base' },
      { id: 'small', sizeBytes: 488_000_000, recommended: false, installed: installed.small, active: active === 'small' }
    ]
  })
  const title = { id: 'title' as const, available: true, options: [{ id: 'a', sizeBytes: 491_000_000, recommended: true }] }

  it('downloads nothing for an option whose files are there', () => {
    expect(bytesToDownload({ sizeBytes: 148_000_000, installed: true })).toBe(0)
    expect(bytesToDownload({ sizeBytes: 148_000_000, installed: false })).toBe(148_000_000)
    expect(bytesToDownload({ sizeBytes: 148_000_000 })).toBe(148_000_000)
  })

  it('starts on the model in use, ticked, rather than on the recommended one', () => {
    const plan = { components: [title, speech({ small: true }, 'small')] }
    expect(defaultChoices(plan).speech).toEqual({ install: true, modelId: 'small' })
  })

  it('starts on the recommended model among the installed ones when none is in use, and on any installed one otherwise', () => {
    expect(defaultChoices({ components: [speech({ tiny: true, base: true })] }).speech?.modelId).toBe('base')
    expect(defaultChoices({ components: [speech({ tiny: true })] }).speech?.modelId).toBe('tiny')
  })

  it('starts on the recommended model when nothing is installed', () => {
    expect(defaultChoices({ components: [speech({})] }).speech?.modelId).toBe('base')
  })

  it('counts nothing to download when the chosen model is installed, and its size when another one is picked', () => {
    const plan = { components: [title, speech({ small: true }, 'small')] }
    expect(totalDownloadBytes(plan, { title: { install: true, modelId: 'a' }, speech: { install: true, modelId: 'small' } })).toBe(491_000_000)
    // The person picks another model of the family: that one is downloaded.
    expect(totalDownloadBytes(plan, { title: { install: true, modelId: 'a' }, speech: { install: true, modelId: 'base' } })).toBe(491_000_000 + 148_000_000)
  })

  it('leaves an installed component out of the overall progress', () => {
    const plan = { components: [speech({ small: true }, 'small')] }
    expect(overallProgress(plan, { speech: { install: true, modelId: 'small' } }, {})).toEqual({ receivedBytes: 0, totalBytes: 0, percent: 0 })
  })
})

describe('transfer figures', () => {
  it('writes a rate in the unit that fits it', () => {
    expect(formatRate(12_400_000)).toBe('12.4 MB/s')
    expect(formatRate(640_000)).toBe('0.6 MB/s')
    expect(formatRate(80_000)).toBe('80 KB/s')
    expect(formatRate(0)).toBe('')
  })

  it('rounds the time left so it does not jump', () => {
    expect(formatDuration(4)).toBe('a few seconds')
    expect(formatDuration(33)).toBe('35 s')
    expect(formatDuration(59)).toBe('55 s')
    expect(formatDuration(61)).toBe('2 min')
    expect(formatDuration(3_700)).toBe('1 h 2 min')
  })

  it('gives no time left without a rate or when everything is there', () => {
    expect(remainingSeconds(100, 1_000, 0)).toBeNull()
    expect(remainingSeconds(1_000, 1_000, 50)).toBeNull()
    expect(remainingSeconds(100, 1_000, 100)).toBe(9)
  })
})
