import { describe, expect, it } from 'vitest'
import { OcrProgressTracker, ocrSuitability, parseJsonLines, pickRecommendedPack, type OcrDownloadEvent, type OcrPack } from './setup-ocr'

const pack = (id: string, languages: string[]): OcrPack => ({ id, label: id, languages, size_mb: 8, download_bytes: 100_000_000, installed: false, active: false })
const PACKS = [pack('ch-en', ['zh', 'en']), pack('latin', ['fr', 'en', 'es', 'de'])]

describe('parseJsonLines', () => {
  it('reads one object per line and skips what is not JSON', () => {
    const text = '{"event":"progress","file":"det.ort"}\n[log] hello\r\n{"event":"done"}\n{"event":"pro'
    expect(parseJsonLines<{ event: string }>(text).map((item) => item.event)).toEqual(['progress', 'done'])
  })
})

describe('pickRecommendedPack', () => {
  it('takes the pack that reads the language of the system', () => {
    expect(pickRecommendedPack(PACKS, 'fr-FR')).toBe('latin')
    expect(pickRecommendedPack(PACKS, 'zh_CN')).toBe('ch-en')
  })

  it('takes the Latin pack for English, which every pack reads, and for an unknown language', () => {
    expect(pickRecommendedPack(PACKS, 'en-US')).toBe('latin')
    expect(pickRecommendedPack(PACKS, 'sw-KE')).toBe('latin')
  })

  it('falls back to the first pack when there is no Latin one, and to nothing when there is no pack', () => {
    expect(pickRecommendedPack([pack('ch-en', ['zh'])], 'fr')).toBe('ch-en')
    expect(pickRecommendedPack([], 'fr')).toBeNull()
  })
})

describe('ocrSuitability', () => {
  const GIB = 1024 ** 3
  it('is fine on a computer with 8 GB and 4 cores', () => {
    expect(ocrSuitability({ totalMemoryBytes: 15.8 * GIB, cpuCount: 12 })).toEqual({ ok: true })
    expect(ocrSuitability({ totalMemoryBytes: 8 * GIB, cpuCount: 4 })).toEqual({ ok: true })
  })

  it('is not ticked with little memory or few cores, and says why', () => {
    const low = ocrSuitability({ totalMemoryBytes: 4 * GIB, cpuCount: 8 })
    expect(low.ok).toBe(false)
    expect(low.note).toMatch(/later in Config/)
    expect(ocrSuitability({ totalMemoryBytes: 16 * GIB, cpuCount: 2 }).ok).toBe(false)
  })
})

describe('OcrProgressTracker', () => {
  const progress = (file: string, received: number, total = -1): OcrDownloadEvent => ({ event: 'progress', file, received, total })

  it('adds the files together', () => {
    const tracker = new OcrProgressTracker(100)
    expect(tracker.update(progress('det.ort', 30)).receivedBytes).toBe(30)
    expect(tracker.update(progress('det.ort', 40)).receivedBytes).toBe(40)
    expect(tracker.update(progress('layout.ort', 20)).receivedBytes).toBe(60)
  })

  it('never goes back and never passes the total', () => {
    const tracker = new OcrProgressTracker(50)
    tracker.update(progress('a', 40))
    expect(tracker.update(progress('a', 10)).receivedBytes).toBe(40)
    expect(tracker.update(progress('b', 40))).toEqual({ receivedBytes: 50, totalBytes: 50 })
  })

  it('ignores an event with no file', () => {
    const tracker = new OcrProgressTracker(10)
    expect(tracker.update({ event: 'done' }).receivedBytes).toBe(0)
  })
})
