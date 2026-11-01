import { describe, expect, it } from 'vitest'
import { compareVersions, releaseToShow, RELEASES, type ReleaseNotes } from './whatsNew'

const note = (version: string): ReleaseNotes => ({ version, headline: version, highlights: [] })

describe('compareVersions', () => {
  it('orders versions by their numbers, not as text', () => {
    expect(compareVersions('0.10.0', '0.9.5')).toBeGreaterThan(0)
    expect(compareVersions('0.2.2', '0.3.0')).toBeLessThan(0)
    expect(compareVersions('1.0', '1.0.0')).toBe(0)
    expect(compareVersions('0.3.0-beta.1', '0.3.0')).toBe(0)
  })
})

describe('releaseToShow', () => {
  const releases = [note('0.4.0'), note('0.3.0')]

  it('says nothing on a first install', () => {
    expect(releaseToShow('0.3.0', null, releases)).toBeNull()
  })

  it('shows the newest release that came with the update', () => {
    expect(releaseToShow('0.4.0', '0.2.2', releases)?.version).toBe('0.4.0')
    expect(releaseToShow('0.3.0', '0.2.2', releases)?.version).toBe('0.3.0')
  })

  it('says nothing once it was seen, or when the version brings nothing', () => {
    expect(releaseToShow('0.3.0', '0.3.0', releases)).toBeNull()
    expect(releaseToShow('0.3.1', '0.3.0', releases)).toBeNull()
  })

  it('does not show a release the installed version does not include yet', () => {
    expect(releaseToShow('0.2.2', '0.2.1', releases)).toBeNull()
  })
})

describe('the notes', () => {
  it('give every release a headline and highlights with a picture, a title and a text', () => {
    for (const release of RELEASES) {
      expect(release.headline).not.toBe('')
      expect(release.highlights.length).toBeGreaterThan(0)
      for (const highlight of release.highlights) {
        expect(highlight.title).not.toBe('')
        expect(highlight.text).not.toBe('')
      }
    }
  })
})
