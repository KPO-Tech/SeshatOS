import { describe, expect, it } from 'vitest'
import { CODE_MIN_CONTRAST, REPLACED, THEMES, buildTokens, codeTokens, contrastRatio, effectiveSurfaces, ensureContrast, isThemeId, mix, presetsCss, themeById } from './themes'

describe('theme registry', () => {
  it('has unique ids and the 15 chosen appearances', () => {
    const ids = THEMES.map((theme) => theme.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toHaveLength(15)
    expect(ids).toEqual(expect.arrayContaining(['dark', 'light', 'seshat-night', 'shine', 'carbon', 'graphite', 'mirage', 'dusk', 'one-dark']))
  })

  it('replaces every preset taken out by one of the same scheme that is kept', () => {
    const removed: Record<string, 'dark' | 'light'> = {
      midnight: 'dark', orbit: 'dark', 'after-rain': 'dark', aurora: 'dark', phosphor: 'dark', kanagawa: 'dark', nebula: 'dark', ember: 'dark',
      frost: 'light', seafoam: 'light', dune: 'light', peach: 'light', sherbet: 'light', lilac: 'light'
    }
    expect(Object.keys(REPLACED).sort()).toEqual(Object.keys(removed).sort())
    for (const [id, scheme] of Object.entries(removed)) {
      expect(isThemeId(id)).toBe(false)
      expect(themeById(REPLACED[id])?.scheme, id).toBe(scheme)
    }
  })

  it('knows its ids and refuses anything else', () => {
    expect(isThemeId('mirage')).toBe(true)
    expect(isThemeId('auto')).toBe(false)
    expect(isThemeId('"><script>')).toBe(false)
    expect(isThemeId(undefined)).toBe(false)
    expect(themeById('nope')).toBeUndefined()
  })
})

describe('theme contrast', () => {
  it.each(THEMES.map((theme) => [theme.id, theme] as const))('%s keeps its text readable on every surface it shows', (_id, seed) => {
    const tokens = buildTokens(seed)
    for (const surface of effectiveSurfaces(seed)) {
      expect(contrastRatio(tokens['--text-primary'], surface.root)).toBeGreaterThanOrEqual(7)
      expect(contrastRatio(tokens['--text-primary'], surface.panel)).toBeGreaterThanOrEqual(7)
      expect(contrastRatio(tokens['--text-secondary'], surface.root)).toBeGreaterThanOrEqual(4.5)
      expect(contrastRatio(tokens['--text-secondary'], surface.panel)).toBeGreaterThanOrEqual(4.5)
      expect(contrastRatio(tokens['--text-muted'], surface.root)).toBeGreaterThanOrEqual(3)
    }
  })

  // Primary buttons draw white text on the accent. Seshat's own orange (2.8) is the identity colour and stays as it is.
  it.each(THEMES.filter((theme) => theme.id !== 'dark' && theme.id !== 'light').map((theme) => [theme.id, theme] as const))('%s keeps white text readable on its accent', (_id, seed) => {
    expect(contrastRatio('#ffffff', seed.accent)).toBeGreaterThanOrEqual(3)
  })

  it.each(THEMES.map((theme) => [theme.id, theme] as const))('%s tells its surfaces apart from the background', (_id, seed) => {
    const tokens = buildTokens(seed)
    for (const surface of effectiveSurfaces(seed)) {
      expect(contrastRatio(tokens['--border-soft'], surface.root)).toBeGreaterThan(1.1)
    }
  })
})

describe('code colours', () => {
  it.each(THEMES.map((theme) => [theme.id, theme] as const))('%s keeps every token of code readable on its code background', (_id, seed) => {
    const tokens = codeTokens(seed)
    const bg = tokens['--code-bg']
    for (const [name, value] of Object.entries(tokens)) {
      if (name === '--code-bg') continue
      const min = name === '--code-comment' ? 3.2 : CODE_MIN_CONTRAST
      expect(contrastRatio(value, bg), `${name} ${value} on ${bg}`).toBeGreaterThanOrEqual(min)
    }
  })

  it('pushes a colour toward the text until it reads, and leaves a readable one alone', () => {
    expect(ensureContrast('#222222', '#000000', '#ffffff', 4.5)).not.toBe('#222222')
    expect(contrastRatio(ensureContrast('#222222', '#000000', '#ffffff', 4.5), '#000000')).toBeGreaterThanOrEqual(4.5)
    expect(ensureContrast('#ffffff', '#000000', '#ffffff', 4.5)).toBe('#ffffff')
  })

  it('includes the code colours in every preset and in the two Seshat themes', () => {
    const css = presetsCss()
    // The 13 presets, Seshat Dark, Seshat Light, and Seshat Light again for a system set to light.
    expect(css.match(/--code-keyword:/g)).toHaveLength(16)
    expect(css).toContain('@media (prefers-color-scheme: light)')
  })

  it('keeps the code colours One Dark brings, without pulling them toward its accent', () => {
    const one = themeById('one-dark')
    expect(one?.syntax).toBeDefined()
    const tokens = codeTokens(one!)
    expect(tokens['--code-keyword']).toBe('#c678dd')
    expect(tokens['--code-string']).toBe('#98c379')
    expect(tokens['--code-function']).toBe('#61afef')
    // A theme without its own colours still has them pulled toward the accent.
    expect(codeTokens(themeById('mirage')!)['--code-keyword']).not.toBe('#c586c0')
  })
})

describe('tokens', () => {
  it('give every theme the same complete set', () => {
    // --wallpaper is set only by the themes that have one.
    const [first, ...rest] = THEMES.map((theme) => Object.keys(buildTokens(theme)).filter((key) => key !== '--wallpaper').sort())
    for (const keys of rest) expect(keys).toEqual(first)
    expect(first).toEqual(expect.arrayContaining(['--surface-root', '--text-primary', '--accent-primary', '--color-error-rgb']))
  })

  it('mixes colours', () => {
    expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080')
    expect(mix('#102030', '#102030', 0.7)).toBe('#102030')
  })

  it('writes every token for the 13 presets, and only the code colours for the two Seshat themes', () => {
    const css = presetsCss()
    expect(css).toContain(':root[data-theme="mirage"]')
    expect(css).toContain(':root[data-theme="one-dark"]')
    expect(css.match(/--surface-root:/g)).toHaveLength(13)
    expect(css.match(/--text-primary:/g)).toHaveLength(13)
  })
})
