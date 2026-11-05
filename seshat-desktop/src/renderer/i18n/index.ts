// The translation of the interface (what a person reads, never what a model reads: see docs/I18N.md).
//
// A catalogue is a file per language and per namespace, src/renderer/i18n/locales/<language>/<namespace>.json (a folder groups several:
// knowledge/ask.json is the namespace knowledge/ask). English is the source and
// the fallback: a text a language lacks is shown in English, and a key nobody wrote is shown as the key, never as "namespace:key".
import i18n, { type BackendModule, type InitOptions } from 'i18next'
import { initReactI18next } from 'react-i18next'
import { FALLBACK_LANGUAGE, SUPPORTED_LANGUAGES, detectLanguage, normalizeLanguage, readStoredLanguage, storeLanguage, type LanguageCode } from './languages'

type Catalog = Record<string, unknown>

const loaders = import.meta.glob<{ default: Catalog }>('./locales/**/*.json')
const ENGLISH_DIR = `./locales/${FALLBACK_LANGUAGE}/`

/** The namespaces: the files of the English catalogue, since English is the source. */
export const NAMESPACES: readonly string[] = Object.keys(loaders)
  .filter((path) => path.startsWith(ENGLISH_DIR))
  .map((path) => path.slice(ENGLISH_DIR.length, -'.json'.length))
  .sort()

/** Reads a catalogue when it is asked for. A language with no file for a namespace answers with nothing, and English fills in. */
export const catalogLoader: BackendModule = {
  type: 'backend',
  init: () => undefined,
  read(language, namespace, callback) {
    const load = loaders[`./locales/${language}/${namespace}.json`]
    if (!load) {
      callback(null, {})
      return
    }
    load().then((module) => callback(null, module.default)).catch((error: Error) => callback(error, null))
  }
}

export function i18nOptions(language: LanguageCode): InitOptions {
  return {
    lng: language,
    fallbackLng: FALLBACK_LANGUAGE,
    supportedLngs: SUPPORTED_LANGUAGES.map((entry) => entry.code),
    nonExplicitSupportedLngs: false,
    ns: [...NAMESPACES],
    defaultNS: 'common',
    // React escapes what it draws: escaping here too would show "&amp;" in a label.
    interpolation: { escapeValue: false },
    // The catalogues are read before the first render (initI18n), so no component has to wait for one.
    react: { useSuspense: false },
    returnNull: false
  }
}

function applyDocumentLanguage(language: string | undefined) {
  if (typeof document !== 'undefined') document.documentElement.lang = normalizeLanguage(language) ?? FALLBACK_LANGUAGE
}

let ready: Promise<void> | null = null

/** Starts the translation with the language the person chose, or the one of the system: call it once, before the first render. */
export function initI18n(): Promise<void> {
  if (!ready) {
    const preferred = typeof navigator === 'undefined' ? [] : navigator.languages?.length ? navigator.languages : [navigator.language]
    const language = detectLanguage(readStoredLanguage(), preferred)
    i18n.on('languageChanged', applyDocumentLanguage)
    ready = i18n
      .use(catalogLoader)
      .use(initReactI18next)
      .init(i18nOptions(language))
      .then(() => applyDocumentLanguage(language))
  }
  return ready
}

/** Shows the interface in another language at once, and remembers the choice. */
export async function setLanguage(code: LanguageCode): Promise<void> {
  storeLanguage(code)
  await i18n.changeLanguage(code)
}

export function currentLanguage(): LanguageCode {
  return normalizeLanguage(i18n.resolvedLanguage ?? i18n.language) ?? FALLBACK_LANGUAGE
}

export { i18n }
