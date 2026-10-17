import { describe, expect, it } from 'vitest'
import {
  duplicateTheme,
  exportTheme,
  importTheme,
  isHexColor,
  parseCustomTheme,
  parseWallpaper,
  readabilityWarning,
  schemeOfSurface,
  seedFromPalette
} from './customThemes'
import { buildTokens, contrastRatio, themeById, wallpaperCss } from './themes'

const palette = { surface: '#1c1d1c', accent: '#b5cea5', text: '#dedfdd' }
const gradient = { kind: 'gradient', angle: 135, stops: ['#112233', '#445566'] }

describe('colours and scheme', () => {
  it('accepts only six hex digits', () => {
    expect(isHexColor('#a1b2c3')).toBe(true)
    for (const bad of ['#abc', 'a1b2c3', '#a1b2c3;', 'red', 'url(x)', '#12345g', 12, null]) expect(isHexColor(bad)).toBe(false)
  })

  it('tells dark surfaces from light ones', () => {
    expect(schemeOfSurface('#1c1d1c')).toBe('dark')
    expect(schemeOfSurface('#f7f7f5')).toBe('light')
  })

  it('derives a raised panel on the side of the text', () => {
    const dark = seedFromPalette('custom-a', 'A', palette)
    expect(dark.scheme).toBe('dark')
    expect(dark.panel).not.toBe(dark.bg)
    const light = seedFromPalette('custom-b', 'B', { surface: '#f0efe9', accent: '#8a5a2b', text: '#222222' })
    expect(light.scheme).toBe('light')
    expect(buildTokens(light)['--surface-panel']).toBe(light.panel)
  })
})

describe('parseWallpaper', () => {
  it('accepts a gradient of two to four colours and an angle', () => {
    expect(parseWallpaper(gradient)).toEqual(gradient)
    expect(parseWallpaper({ ...gradient, stops: ['#112233'] })).toBeUndefined()
    expect(parseWallpaper({ ...gradient, stops: ['#1', '#2', '#3', '#4', '#5'] })).toBeUndefined()
    expect(parseWallpaper({ ...gradient, angle: 400 })).toBeUndefined()
  })

  it('never lets a value become CSS', () => {
    expect(parseWallpaper({ kind: 'gradient', angle: 10, stops: ['red;}body{display:none', '#000000'] })).toBeUndefined()
    expect(parseWallpaper({ kind: 'image', dataUrl: 'https://evil.example/x.png', dim: 0.3 })).toBeUndefined()
    expect(parseWallpaper({ kind: 'image', dataUrl: 'data:image/svg+xml;base64,PHN2Zz4=', dim: 0.3 })).toBeUndefined()
    expect(parseWallpaper({ kind: 'image', dataUrl: 'data:image/png;base64,AAAA")};body{x:y', dim: 0.3 })).toBeUndefined()
    expect(parseWallpaper('gradient')).toBeUndefined()
  })

  it('keeps a small picture and clamps its veil', () => {
    const w = parseWallpaper({ kind: 'image', dataUrl: 'data:image/jpeg;base64,/9j/4AAQ', dim: 5 })
    expect(w).toEqual({ kind: 'image', dataUrl: 'data:image/jpeg;base64,/9j/4AAQ', dim: 0.8 })
  })
})

describe('parseCustomTheme', () => {
  it('builds a theme from a valid object and trims the name', () => {
    const seed = parseCustomTheme({ label: '  Moss   green ', ...palette, wallpaper: gradient }, 'custom-x')
    expect(seed?.label).toBe('Moss green')
    expect(seed?.category).toBe('custom')
    expect(seed?.wallpaper).toEqual(gradient)
  })

  it('refuses a missing name, a bad colour and a bad wallpaper', () => {
    expect(parseCustomTheme({ label: '', ...palette }, 'custom-x')).toBeNull()
    expect(parseCustomTheme({ label: 'A', ...palette, accent: 'blue' }, 'custom-x')).toBeNull()
    expect(parseCustomTheme({ label: 'A', ...palette, wallpaper: { kind: 'gradient' } }, 'custom-x')).toBeNull()
    expect(parseCustomTheme(null, 'custom-x')).toBeNull()
  })
})

describe('export and import', () => {
  it('round-trips a theme with a gradient', () => {
    const seed = seedFromPalette('custom-a', 'Moss', palette, gradient as never)
    const back = importTheme(exportTheme(seed))
    expect(back.label).toBe('Moss')
    expect(back.bg).toBe(seed.bg)
    expect(back.accent).toBe(seed.accent)
    expect(back.wallpaper).toEqual(gradient)
    expect(back.id).not.toBe(seed.id)
  })

  it('leaves a picture out of the file', () => {
    const seed = seedFromPalette('custom-a', 'Pic', palette, { kind: 'image', dataUrl: 'data:image/png;base64,AAAA', dim: 0.4 })
    expect(exportTheme(seed)).not.toContain('data:image')
    expect(importTheme(exportTheme(seed)).wallpaper).toBeUndefined()
  })

  it('says what is wrong with a file', () => {
    expect(() => importTheme('not json')).toThrow(/JSON/)
    expect(() => importTheme('{"label":"x"}')).toThrow(/not a Seshat theme/)
    expect(() => importTheme('{"seshatTheme":1,"label":"x","surface":"#000000","accent":"nope","text":"#ffffff"}')).toThrow(/incomplete/)
  })
})

describe('duplicateTheme', () => {
  it('copies the colours of a preset into a new custom theme', () => {
    const kanagawa = themeById('kanagawa')!
    const copy = duplicateTheme(kanagawa, 'Mine')
    expect(copy.id).toMatch(/^custom-/)
    expect(copy.category).toBe('custom')
    expect(copy.bg).toBe(kanagawa.bg)
    expect(copy.text).toBe(kanagawa.text)
    expect(copy.accent).toBe(kanagawa.accent)
  })

  it('keeps the wallpaper of a gradient preset', () => {
    expect(duplicateTheme(themeById('midnight')!, 'M').wallpaper?.kind).toBe('gradient')
  })
})

describe('readabilityWarning', () => {
  it('stays quiet for readable colours and speaks for unreadable ones', () => {
    expect(readabilityWarning({ ...palette, accent: '#3f8f5f' })).toBeNull()
    // A light accent is fine for the look, but the white text of buttons would not read on it.
    expect(readabilityWarning(palette)).toMatch(/accent/)
    expect(readabilityWarning({ surface: '#777777', accent: '#b5cea5', text: '#808080' })).toMatch(/hard to read/)
    expect(readabilityWarning({ surface: '#1c1d1c', accent: '#ffff99', text: '#dedfdd' })).toMatch(/accent/)
  })

  it('agrees with the contrast the tokens use', () => {
    expect(contrastRatio(palette.text, palette.surface)).toBeGreaterThan(4.5)
  })
})

describe('wallpaperCss', () => {
  it('builds a gradient background from checked colours', () => {
    const seed = seedFromPalette('custom-a', 'A', palette, gradient as never)
    expect(wallpaperCss(seed)).toBe('linear-gradient(135deg, rgb(17, 34, 51), rgb(68, 85, 102)) center / cover fixed')
  })

  it('makes the surfaces translucent only with a wallpaper', () => {
    const flat = buildTokens(seedFromPalette('custom-a', 'A', palette))
    const over = buildTokens(seedFromPalette('custom-b', 'B', palette, gradient as never))
    expect(flat['--surface-root']).toBe(palette.surface)
    expect('--wallpaper' in flat).toBe(false)
    expect(over['--surface-root']).toMatch(/^rgba\(/)
    expect(over['--wallpaper']).toContain('linear-gradient')
  })
})
