import { useTranslation } from 'react-i18next'
import { FALLBACK_LANGUAGE, normalizeLanguage, type LanguageCode } from './languages'
import { setLanguage } from './index'

/** The language shown, and the way to change it. The component draws again when it changes. */
export function useLanguage(): { language: LanguageCode; setLanguage: (code: LanguageCode) => Promise<void> } {
  const { i18n } = useTranslation()
  return { language: normalizeLanguage(i18n.resolvedLanguage ?? i18n.language) ?? FALLBACK_LANGUAGE, setLanguage }
}
