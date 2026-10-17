import { describe, expect, it } from 'vitest'
import { CODE_MIN_CONTRAST, THEMES, buildTokens, codeTokens, contrastRatio, ensureContrast, isThemeId, mix, presetsCss, themeById } from './themes'

describe('theme registry', () => {
  it('has unique ids and the 28 appearances (Seshat two, 25 presets, plus the system one handled elsewhere)', () => {
    const ids = THEMES.map((theme) => theme.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toHaveLength(27)
    expect(ids).toEqual(expect.arrayContaining(['dark', 'light', 'kanagawa', 'phosphor', 'violet-hour', 'after-rain']))
  })

  it('knows its ids and refuses anything else', () => {
    expect(isThemeId('kanagawa')).toBe(true)
    expect(isThemeId('auto')).toBe(false)
    expect(isThemeId('"><script>')).toBe(false)
    expect(isThemeId(undefined)).toBe(false)
    expect(themeById('nope')).toBeUndefined()
  })
})

describe('theme contrast', () => {
  it.each(THEMES.map((theme) => [theme.id, theme] as const))('%s keeps its text readable', (_id, seed) => {
    const tokens = buildTokens(seed)
    expect(contrastRatio(tokens['--text-primary'], tokens['--surface-root'])).toBeGreaterThanOrEqual(7)
    expect(contrastRatio(tokens['--text-primary'], tokens['--surface-panel'])).toBeGreaterThanOrEqual(7)
    expect(contrastRatio(tokens['--text-secondary'], tokens['--surface-root'])).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(tokens['--text-secondary'], tokens['--surface-panel'])).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(tokens['--text-muted'], tokens['--surface-root'])).toBeGreaterThanOrEqual(3)
  })

  // Primary buttons draw white text on the accent. Seshat's own orange (2.8) is the identity colour and stays as it is.
  it.each(THEMES.filter((theme) => theme.id !== 'dark' && theme.id !== 'light').map((theme) => [theme.id, theme] as const))('%s keeps white text readable on its accent', (_id, seed) => {
    expect(contrastRatio('#ffffff', seed.accent)).toBeGreaterThanOrEqual(3)
  })

  it.each(THEMES.map((theme) => [theme.id, theme] as const))('%s tells its surfaces apart from the background', (_id, seed) => {
    const tokens = buildTokens(seed)
    expect(contrastRatio(tokens['--border-soft'], tokens['--surface-root'])).toBeGreaterThan(1.1)
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
    expect(css.match(/--code-keyword:/g)).toHaveLength(28)
    expect(css).toContain('@media (prefers-color-scheme: light)')
  })
})

describe('tokens', () => {
  it('give every theme the same complete set', () => {
    const [first, ...rest] = THEMES.map((theme) => Object.keys(buildTokens(theme)).sort())
    for (const keys of rest) expect(keys).toEqual(first)
    expect(first).toEqual(expect.arrayContaining(['--surface-root', '--text-primary', '--accent-primary', '--color-error-rgb']))
  })

  it('mixes colours', () => {
    expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080')
    expect(mix('#102030', '#102030', 0.7)).toBe('#102030')
  })

  it('writes every token for the 25 presets, and only the code colours for the two Seshat themes', () => {
    const css = presetsCss()
    expect(css).toContain(':root[data-theme="kanagawa"]')
    expect(css.match(/--surface-root:/g)).toHaveLength(25)
    expect(css.match(/--text-primary:/g)).toHaveLength(25)
  })
})
