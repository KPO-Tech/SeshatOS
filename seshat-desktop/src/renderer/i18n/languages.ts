// The languages of the interface, and how the one to show is chosen. Pure functions: nothing here reads the window, so they test as they are.

export const SUPPORTED_LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'fr', label: 'Français' }
] as const

export type LanguageCode = (typeof SUPPORTED_LANGUAGES)[number]['code']

/** The source of every text, and what is shown when a language lacks one. */
export const FALLBACK_LANGUAGE: LanguageCode = 'en'

export const LANGUAGE_STORAGE_KEY = 'seshat.language'

// Earlier versions kept a name here ("English", "Francais") and nothing read it.
const LEGACY_NAMES: Readonly<Record<string, LanguageCode>> = { English: 'en', Francais: 'fr' }

/** The supported language a value stands for ("fr", "fr-CA", "FR", the legacy "Francais"), or null. */
export function normalizeLanguage(value: string | null | undefined): LanguageCode | null {
  if (!value) return null
  const legacy = LEGACY_NAMES[value]
  if (legacy) return legacy
  const base = value.toLowerCase().split(/[-_]/)[0]
  return SUPPORTED_LANGUAGES.find((language) => language.code === base)?.code ?? null
}

/** The stored choice if there is one, else the first language of the system that is supported, else English. */
export function detectLanguage(stored: string | null | undefined, preferred: readonly string[]): LanguageCode {
  const chosen = normalizeLanguage(stored)
  if (chosen) return chosen
  for (const value of preferred) {
    const match = normalizeLanguage(value)
    if (match) return match
  }
  return FALLBACK_LANGUAGE
}

export function readStoredLanguage(): string | null {
  try {
    return window.localStorage.getItem(LANGUAGE_STORAGE_KEY)
  } catch {
    return null
  }
}

export function storeLanguage(code: LanguageCode) {
  try {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, code)
  } catch {
    // Storage can be blocked: the choice is applied and not remembered.
  }
}
