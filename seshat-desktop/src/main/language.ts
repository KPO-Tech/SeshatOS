import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

// The few texts the main process shows by itself: the menu of the icon near the clock, the notice when the window is hidden, the dialogs of
// the system. The interface proper is drawn by the renderer (src/renderer/i18n); this process does not run React, so it has its own short
// table. The renderer tells it the language the person chose, and it keeps it for the next start, before any window exists.

export type MainLanguage = 'en' | 'fr'
export const MAIN_LANGUAGES: readonly MainLanguage[] = ['en', 'fr']

const MESSAGES = {
  en: {
    'tray.open': 'Open SeshatOS',
    'tray.quit': 'Quit',
    'quit.keepRunning': 'Keep running',
    'quit.confirm': 'Quit',
    'quit.oneTask': 'A task is still running',
    'quit.manyTasks': '{{count}} tasks are still running',
    'quit.detail': 'Quitting stops them.',
    'hidden.title': 'SeshatOS is still working',
    'hidden.oneTask': '1 task is still running',
    'hidden.manyTasks': '{{count}} tasks are still running',
    'hidden.body': '{{what}}. Open SeshatOS from the icon near the clock, or quit it from there.',
    'backend.failed': 'SeshatOS backend failed to start'
  },
  fr: {
    'tray.open': 'Ouvrir SeshatOS',
    'tray.quit': 'Quitter',
    'quit.keepRunning': 'Continuer',
    'quit.confirm': 'Quitter',
    'quit.oneTask': 'Une tâche est en cours',
    'quit.manyTasks': '{{count}} tâches sont en cours',
    'quit.detail': 'Quitter les arrête.',
    'hidden.title': 'SeshatOS travaille encore',
    'hidden.oneTask': '1 tâche en cours',
    'hidden.manyTasks': '{{count}} tâches en cours',
    'hidden.body': '{{what}}. Rouvrez SeshatOS depuis l’icône près de l’horloge, ou quittez-le de là.',
    'backend.failed': 'Le backend de SeshatOS n’a pas démarré'
  }
} as const satisfies Record<MainLanguage, Record<string, string>>

export type MainMessageKey = keyof (typeof MESSAGES)['en']

let current: MainLanguage = 'en'

export function getMainLanguage(): MainLanguage {
  return current
}

export function setMainLanguage(language: MainLanguage): void {
  current = language
}

/** The text for a key in the language of the app, with {{name}} filled in. */
export function mainT(key: MainMessageKey, params: Record<string, string | number> = {}): string {
  const text: string = MESSAGES[current][key] ?? MESSAGES.en[key]
  return text.replace(/\{\{(\w+)\}\}/g, (_match, name: string) => String(params[name] ?? ''))
}

/** "fr-FR" gives "fr"; a language the app does not have gives null. */
export function languageFromLocale(locale: string | undefined): MainLanguage | null {
  const base = (locale ?? '').toLowerCase().split(/[-_]/)[0]
  return MAIN_LANGUAGES.find((code) => code === base) ?? null
}

export function isMainLanguage(value: unknown): value is MainLanguage {
  return typeof value === 'string' && (MAIN_LANGUAGES as readonly string[]).includes(value)
}

/** The language kept by a previous run, or null when there is none (or the file cannot be read). */
export function loadLanguage(path: string): MainLanguage | null {
  try {
    const value = (JSON.parse(readFileSync(path, 'utf8')) as { language?: unknown }).language
    return isMainLanguage(value) ? value : null
  } catch {
    return null
  }
}

export function saveLanguage(path: string, language: MainLanguage): void {
  try {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, JSON.stringify({ language }))
  } catch {
    // The language is a convenience: a failed write only means the next start begins with the language of the system.
  }
}
