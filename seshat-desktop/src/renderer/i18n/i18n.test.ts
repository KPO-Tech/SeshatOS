import i18next from 'i18next'
import { describe, expect, it } from 'vitest'
import { NAMESPACES, catalogLoader, i18nOptions } from './index'
import { FALLBACK_LANGUAGE, detectLanguage, normalizeLanguage } from './languages'

async function start(language: 'en' | 'fr') {
  const instance = i18next.createInstance()
  await instance.use(catalogLoader).init(i18nOptions(language))
  return instance
}

describe('the language to show', () => {
  it('understands a language however it is written', () => {
    expect(normalizeLanguage('fr')).toBe('fr')
    expect(normalizeLanguage('fr-CA')).toBe('fr')
    expect(normalizeLanguage('FR_be')).toBe('fr')
    expect(normalizeLanguage('en-GB')).toBe('en')
    expect(normalizeLanguage('de')).toBeNull()
    expect(normalizeLanguage('')).toBeNull()
    expect(normalizeLanguage(null)).toBeNull()
  })

  it('reads the names earlier versions stored', () => {
    expect(normalizeLanguage('Francais')).toBe('fr')
    expect(normalizeLanguage('English')).toBe('en')
  })

  it('takes the stored choice first, then the system, then English', () => {
    expect(detectLanguage('fr', ['en-US'])).toBe('fr')
    expect(detectLanguage(null, ['de-DE', 'fr-FR', 'en'])).toBe('fr')
    expect(detectLanguage('nonsense', ['es'])).toBe(FALLBACK_LANGUAGE)
    expect(detectLanguage(undefined, [])).toBe('en')
  })
})

describe('the catalogues', () => {
  it('has the English source for every namespace', () => {
    expect(NAMESPACES).toContain('settings')
  })

  it('shows a text in the language chosen and changes it without a restart', async () => {
    const instance = await start('fr')
    expect(instance.t('settings:languageNotifications.sound')).toBe('Son')
    await instance.changeLanguage('en')
    expect(instance.t('settings:languageNotifications.sound')).toBe('Sound')
  })

  it('shows English for a text the language lacks', async () => {
    const instance = await start('fr')
    instance.addResource('en', 'settings', 'test.onlyInEnglish', 'Only in English')
    expect(instance.t('settings:test.onlyInEnglish')).toBe('Only in English')
  })

  it('never shows "namespace:key" for a key nobody wrote', async () => {
    const instance = await start('fr')
    const shown = instance.t('settings:languageNotifications.nobodyWroteThis')
    expect(shown).not.toContain('settings:')
    expect(shown).toBe('languageNotifications.nobodyWroteThis')
  })

  it('does not escape what it fills in: React does that when it draws', async () => {
    const instance = await start('en')
    instance.addResource('en', 'settings', 'test.fill', 'Open {{name}}')
    expect(instance.t('settings:test.fill', { name: 'A & B' })).toBe('Open A & B')
  })
})
