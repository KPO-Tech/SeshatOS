import { describe, expect, it } from 'vitest'
import en from '../i18n/locales/en/shell.json'
import fr from '../i18n/locales/fr/shell.json'
import { compareVersions, releaseLabel, releaseToShow, RELEASES, type ReleaseNotes } from './whatsNew'

const note = (version: string): ReleaseNotes => ({ version, highlights: [] })

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
  it('give every card of a release a title and a text in English and in French', () => {
    for (const locale of [en, fr] as const) {
      expect(locale.whatsnew.release.headline).not.toBe('')
      for (const release of RELEASES) {
        expect(release.highlights.length).toBeGreaterThan(0)
        for (const highlight of release.highlights) {
          const texts = (locale.whatsnew.highlights as Record<string, { title: string; text: string }>)[highlight.id]
          expect(texts?.title, highlight.id).toBeTruthy()
          expect(texts?.text, highlight.id).toBeTruthy()
        }
      }
    }
  })
})

describe('releaseLabel', () => {
  it('says the range of a release that tells everything since a version', () => {
    expect(releaseLabel({ version: '0.3.17', from: '0.3.0', highlights: [] })).toBe('0.3.0 → 0.3.17')
    expect(releaseLabel({ version: '0.4.0', highlights: [] })).toBe('0.4.0')
  })
})

describe('RELEASES', () => {
  it('has one card per picture, each used once, and the newest release first', () => {
    const ids = RELEASES[0].highlights.map((highlight) => highlight.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (let index = 1; index < RELEASES.length; index += 1) {
      expect(compareVersions(RELEASES[index - 1].version, RELEASES[index].version)).toBeGreaterThan(0)
    }
  })

  it('shows the card of 0.3.17 to a person who comes from any older 0.3 version', () => {
    for (const seen of ['0.3.0', '0.3.5', '0.3.16']) {
      expect(releaseToShow('0.3.17', seen)?.version).toBe('0.3.17')
    }
    expect(releaseToShow('0.3.17', '0.3.17')).toBeNull()
  })
})
