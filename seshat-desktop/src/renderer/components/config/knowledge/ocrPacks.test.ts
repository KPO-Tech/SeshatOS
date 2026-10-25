import { describe, expect, it } from 'vitest'
import { languageName, packDescription, packName, packOptions } from './ocrPacks'
import type { NativeDocPack } from './knowledgeTypes'

const latin: NativeDocPack = {
  id: 'latin',
  label: 'Latin alphabets (French, English, Spanish, German, Italian, Portuguese...)',
  languages: ['fr', 'en', 'es', 'de', 'it', 'pt', 'nl', 'pl', 'ro', 'sv', 'da', 'no', 'fi', 'tr', 'cs', 'hu'],
  size_mb: 8,
  installed: false,
  active: false
}
const chinese: NativeDocPack = { id: 'ch-en', label: 'Chinese and English', languages: ['zh', 'en'], size_mb: 11, installed: true, active: true }

describe('OCR pack texts', () => {
  it('names a language in English, and keeps the code when it does not know it', () => {
    expect(languageName('fr')).toBe('French')
    expect(languageName('zh')).toBe('Chinese')
    expect(languageName('not a language')).toBe('not a language')
  })

  it('drops the list of languages the backend puts in brackets after the name', () => {
    expect(packName(latin)).toBe('Latin alphabets')
    expect(packName(chinese)).toBe('Chinese and English')
  })

  it('says what the pack reads, how big it is, and where it stands', () => {
    expect(packDescription(latin)).toBe('French, English, Spanish, German and 12 more · 8 MB')
    expect(packDescription(chinese)).toBe('Chinese, English · 11 MB · in use')
    expect(packDescription({ ...latin, installed: true })).toBe('French, English, Spanish, German and 12 more · 8 MB · downloaded')
  })

  it('builds one choice per pack, valued by the id', () => {
    expect(packOptions([latin, chinese]).map((option) => [option.value, option.label])).toEqual([
      ['latin', 'Latin alphabets'],
      ['ch-en', 'Chinese and English']
    ])
  })
})
