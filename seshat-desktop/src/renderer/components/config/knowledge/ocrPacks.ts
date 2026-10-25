import type { SelectOption } from './KnowledgePrimitives'
import type { NativeDocPack } from './knowledgeTypes'

const LANGUAGES_SHOWN = 4

let displayNames: Intl.DisplayNames | null | undefined

/** The name of a language, in English: "fr" is "French". The code itself when the system does not know it. */
export function languageName(code: string): string {
  if (displayNames === undefined) {
    try {
      displayNames = new Intl.DisplayNames(['en'], { type: 'language' })
    } catch {
      displayNames = null
    }
  }
  try {
    return displayNames?.of(code) ?? code
  } catch {
    return code
  }
}

/** The name of a pack without the list of languages the backend puts in brackets after it: "Latin alphabets (French, ...)" is "Latin alphabets". */
export function packName(pack: NativeDocPack): string {
  return pack.label.replace(/\s*\(.*\)\s*$/, '')
}

/** What a pack reads, size and state, on one line: "French, English, Spanish, German and 12 more · 8 MB · in use". */
export function packDescription(pack: NativeDocPack): string {
  const names = pack.languages.map(languageName)
  const shown = names.slice(0, LANGUAGES_SHOWN).join(', ')
  const rest = names.length - LANGUAGES_SHOWN
  const parts = [rest > 0 ? `${shown} and ${rest} more` : shown, `${pack.size_mb} MB`]
  if (pack.active) parts.push('in use')
  else if (pack.installed) parts.push('downloaded')
  return parts.join(' · ')
}

/** The packs as the choices of the app's select: a short name, and under it what the pack reads. */
export function packOptions(packs: NativeDocPack[]): SelectOption[] {
  return packs.map((pack) => ({ value: pack.id, label: packName(pack), description: packDescription(pack) }))
}
