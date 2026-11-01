import { afterEach, describe, expect, it, vi } from 'vitest'
import { ACCENTS, accentCss, getStoredAccent } from './accent'
import { hasSeenIntro, markIntroSeen } from './intro'

function stubStorage(store: Record<string, string> = {}, failing = false) {
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (key: string) => {
        if (failing) throw new Error('blocked')
        return store[key] ?? null
      },
      setItem: (key: string, value: string) => {
        if (failing) throw new Error('blocked')
        store[key] = value
      },
      removeItem: (key: string) => {
        delete store[key]
      }
    }
  })
  return store
}

afterEach(() => vi.unstubAllGlobals())

describe('accent', () => {
  it('offers Seshat orange first and only six-digit colours', () => {
    expect(ACCENTS[0].hex).toBe('#ef7c2f')
    expect(ACCENTS.every((accent) => /^#[0-9a-f]{6}$/.test(accent.hex))).toBe(true)
  })

  it('writes the colour and its tint over the theme', () => {
    expect(accentCss('#3b82f6')).toBe('html:root[data-accent] {\n  --accent-primary: #3b82f6;\n  --accent-subtle: rgba(59, 130, 246, 0.12);\n}')
  })

  it('reads back the accent that was chosen, in lower case', () => {
    stubStorage({ 'seshat.accent': '#3B82F6' })
    expect(getStoredAccent()).toBe('#3b82f6')
  })

  it('ignores a stored value that is not a colour, or storage that cannot be read', () => {
    stubStorage({ 'seshat.accent': 'url(javascript:alert(1))' })
    expect(getStoredAccent()).toBeNull()
    stubStorage({}, true)
    expect(getStoredAccent()).toBeNull()
  })
})

describe('intro', () => {
  it('is shown on a new install and not again once it was seen', () => {
    stubStorage()
    expect(hasSeenIntro()).toBe(false)
    markIntroSeen()
    expect(hasSeenIntro()).toBe(true)
  })

  it('counts as seen when the storage is blocked, so that it does not come back at every start', () => {
    stubStorage({}, true)
    expect(hasSeenIntro()).toBe(true)
  })
})
