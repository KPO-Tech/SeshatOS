import { describe, expect, it } from 'vitest'
import { hasHiddenCharacters, revealHidden } from './revealHidden'

describe('revealHidden', () => {
  it('shows direction overrides, tags and escapes as code points', () => {
    expect(revealHidden('ls‮ txt')).toBe('ls«U+202E» txt')
    expect(revealHidden('echo \u{e0041}')).toBe('echo «U+E0041»')
    expect(revealHidden('a\u001b[2J')).toBe('a«U+001B»[2J')
    expect(revealHidden('a\u0000b')).toBe('a«U+0000»b')
  })

  it('leaves visible text, newlines and tabs alone', () => {
    const text = 'echo héllo 日本語\n\tls'
    expect(revealHidden(text)).toBe(text)
  })

  it('reports hidden characters, repeatedly (no stale regex state)', () => {
    expect(hasHiddenCharacters('x⁦y')).toBe(true)
    expect(hasHiddenCharacters('x⁦y')).toBe(true)
    expect(hasHiddenCharacters('plain')).toBe(false)
  })
})
