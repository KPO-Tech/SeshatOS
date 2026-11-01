// What the app tells the person about, kept on this computer: the choices (Settings > General) and the history shown by the bell.

export type NotificationKind = 'task' | 'error' | 'update'

export type NotificationPrefs = {
  /** The system notification, shown when the window is not the one in front. */
  desktop: boolean
  sound: boolean
  /** Which kinds are told at all: a kind that is off is neither recorded in the bell nor shown by the system. */
  tasks: boolean
  errors: boolean
  updates: boolean
}

export const DEFAULT_PREFS: NotificationPrefs = { desktop: true, sound: false, tasks: true, errors: true, updates: true }

export type AppNotification = {
  id: string
  kind: NotificationKind
  title: string
  body?: string
  /** The page that explains it, opened by a click. */
  route?: string
  at: number
  read: boolean
}

export const PREFS_KEY = 'seshat.notify.prefs'
export const LOG_KEY = 'seshat.notify.log'
/** How many notifications the bell keeps. */
export const LOG_LIMIT = 50

const KIND_PREF: Record<NotificationKind, keyof NotificationPrefs> = { task: 'tasks', error: 'errors', update: 'updates' }

/** What to do with a notification, given the choices and whether the window is in front. */
export function decide(kind: NotificationKind, prefs: NotificationPrefs, windowFocused: boolean): { record: boolean; desktop: boolean; sound: boolean } {
  const record = prefs[KIND_PREF[kind]]
  return { record, desktop: record && prefs.desktop && !windowFocused, sound: record && prefs.sound }
}

function read<T>(key: string): unknown {
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : undefined
  } catch {
    return undefined
  }
}

function write(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage is blocked: the choices and the history last until the app closes.
  }
}

export function getPrefs(): NotificationPrefs {
  const stored = read<Partial<NotificationPrefs>>(PREFS_KEY)
  const prefs = { ...DEFAULT_PREFS }
  if (stored && typeof stored === 'object') {
    for (const key of Object.keys(DEFAULT_PREFS) as Array<keyof NotificationPrefs>) {
      const value = (stored as Record<string, unknown>)[key]
      if (typeof value === 'boolean') prefs[key] = value
    }
  }
  return prefs
}

export const PREFS_EVENT = 'seshat-notify-prefs'

export function setPrefs(next: NotificationPrefs) {
  write(PREFS_KEY, next)
  window.dispatchEvent(new Event(PREFS_EVENT))
}

const KINDS: NotificationKind[] = ['task', 'error', 'update']

export function getLog(): AppNotification[] {
  const stored = read<unknown[]>(LOG_KEY)
  if (!Array.isArray(stored)) return []
  return stored
    .filter((item): item is AppNotification => {
      const entry = item as Partial<AppNotification> | null
      return Boolean(entry) && typeof entry!.id === 'string' && typeof entry!.title === 'string' && typeof entry!.at === 'number' && KINDS.includes(entry!.kind as NotificationKind)
    })
    .slice(0, LOG_LIMIT)
}

export function saveLog(items: AppNotification[]) {
  write(LOG_KEY, items.slice(0, LOG_LIMIT))
}

/** How long ago, in a few words: "just now", "5 min ago", "3 h ago", "2 d ago". */
export function ago(at: number, now: number): string {
  const seconds = Math.max(0, Math.floor((now - at) / 1000))
  if (seconds < 45) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${Math.max(1, minutes)} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  return `${Math.round(hours / 24)} d ago`
}

/** A short two-note chime, made in place so that nothing has to be shipped. */
export function playChime() {
  try {
    const Context = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Context) return
    const context = new Context()
    const start = context.currentTime
    ;[660, 880].forEach((frequency, index) => {
      const oscillator = context.createOscillator()
      const gain = context.createGain()
      oscillator.frequency.value = frequency
      gain.gain.setValueAtTime(0.0001, start + index * 0.14)
      gain.gain.exponentialRampToValueAtTime(0.12, start + index * 0.14 + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + index * 0.14 + 0.2)
      oscillator.connect(gain).connect(context.destination)
      oscillator.start(start + index * 0.14)
      oscillator.stop(start + index * 0.14 + 0.22)
    })
    window.setTimeout(() => void context.close(), 800)
  } catch {
    // No sound device: the notification is shown all the same.
  }
}
