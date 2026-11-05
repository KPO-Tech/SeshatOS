import type { TFunction } from 'i18next'
import { currentLanguage } from '@renderer/i18n'

export const AUTO_LANGUAGE = 'auto'

// Languages Whisper transcribes well, most spoken first. The tag is what the server expects.
export const SPOKEN_LANGUAGES: readonly string[] = ['fr', 'en', 'es', 'de', 'it', 'pt', 'nl', 'ar', 'zh', 'ja', 'ko', 'hi', 'ru', 'uk', 'pl', 'tr', 'sv', 'da', 'no', 'fi', 'cs', 'el', 'he', 'hu', 'ro', 'id', 'vi', 'th', 'sw', 'yo']

/** The name of a language in the language of the interface ("Français" or "French"), written by the browser. */
function languageName(code: string, language: string): string {
  const name = new Intl.DisplayNames([language], { type: 'language' }).of(code) ?? code
  return name.charAt(0).toLocaleUpperCase(language) + name.slice(1)
}

export function languageOptions(t: TFunction, language: string = currentLanguage()) {
  return [
    { value: AUTO_LANGUAGE, label: t('config:multimodal.spokenLanguages.detect'), description: t('config:multimodal.spokenLanguages.detectDescription') },
    ...SPOKEN_LANGUAGES.map((code) => ({ value: code, label: languageName(code, language) }))
  ]
}
