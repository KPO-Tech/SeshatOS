import { FORM_LIMITS } from '../../lang/forms'

// What a reader has typed in a form, and whether it was sent, kept in this computer's browser storage so that a change of page does not lose
// a text they were writing. It is never sent anywhere: only the click on Submit sends a message, and the message is the one they see.

export type StoredForm = { values: Record<string, string>; sent: boolean }

const PREFIX = 'seshat.form.'

/** A short stable key for the text of a block: the same block gives the same key, in any message. */
export function blockHash(text: string): string {
  let hash = 5381
  for (let i = 0; i < text.length; i++) hash = ((hash << 5) + hash + text.charCodeAt(i)) >>> 0
  return hash.toString(36)
}

export function loadForm(key: string): StoredForm | null {
  try {
    const raw = window.localStorage.getItem(PREFIX + key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<StoredForm>
    if (typeof parsed !== 'object' || parsed === null || typeof parsed.values !== 'object' || parsed.values === null) return null
    const values: Record<string, string> = {}
    for (const [name, value] of Object.entries(parsed.values)) {
      if (typeof value === 'string') values[name] = value.slice(0, FORM_LIMITS.typed)
    }
    return { values, sent: parsed.sent === true }
  } catch {
    return null
  }
}

export function saveForm(key: string, form: StoredForm): void {
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify(form))
  } catch {
    // Storage may be full, blocked or absent: the form keeps working, it only cannot be found again later.
  }
}

// The same for the sliders of a block (ADR 0014): the numbers a reader set, so that a change of page does not put them back.
const VARS_PREFIX = 'seshat.vars.'

export function loadVars(key: string): Record<string, unknown> | null {
  try {
    const raw = window.localStorage.getItem(VARS_PREFIX + key)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null
  } catch {
    return null
  }
}

export function saveVars(key: string, values: Record<string, number>): void {
  try {
    window.localStorage.setItem(VARS_PREFIX + key, JSON.stringify(values))
  } catch {
    // Storage may be full, blocked or absent: the sliders keep working.
  }
}

// The same for the rows of a Sheet (ADR 0020): what the reader typed in the cells of a table.
const SHEET_PREFIX = 'seshat.sheet.'

export function loadSheet(key: string, columns: number): string[][] | null {
  try {
    const raw = window.localStorage.getItem(SHEET_PREFIX + key)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed) || parsed.length === 0 || parsed.length > 30) return null
    return parsed.map((row) => Array.from({ length: columns }, (_, at) => (Array.isArray(row) && typeof row[at] === 'string' ? (row[at] as string).slice(0, 120) : '')))
  } catch {
    return null
  }
}

export function saveSheet(key: string, rows: string[][]): void {
  try {
    window.localStorage.setItem(SHEET_PREFIX + key, JSON.stringify(rows))
  } catch {
    // Storage may be full, blocked or absent: the table keeps working.
  }
}
