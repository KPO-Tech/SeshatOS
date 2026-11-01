import { beforeEach, describe, expect, it } from 'vitest'
import { ago, DEFAULT_PREFS, decide, getLog, getPrefs, LOG_KEY, LOG_LIMIT, PREFS_KEY, saveLog, setPrefs, type AppNotification } from './notifications'

const store = new Map<string, string>()

beforeEach(() => {
  store.clear()
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      localStorage: { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => void store.set(key, value) },
      dispatchEvent: () => true
    }
  })
})

const note = (id: string, extra: Partial<AppNotification> = {}): AppNotification => ({ id, kind: 'task', title: id, at: 1, read: false, ...extra })

describe('decide', () => {
  it('shows the system notification only when the window is not in front', () => {
    expect(decide('task', DEFAULT_PREFS, false)).toEqual({ record: true, desktop: true, sound: false })
    expect(decide('task', DEFAULT_PREFS, true)).toEqual({ record: true, desktop: false, sound: false })
  })

  it('tells nothing of a kind that is turned off', () => {
    expect(decide('error', { ...DEFAULT_PREFS, errors: false, sound: true }, false)).toEqual({ record: false, desktop: false, sound: false })
    expect(decide('update', { ...DEFAULT_PREFS, updates: false }, false).record).toBe(false)
  })

  it('keeps the bell and the chime when the system notifications are off', () => {
    expect(decide('task', { ...DEFAULT_PREFS, desktop: false, sound: true }, false)).toEqual({ record: true, desktop: false, sound: true })
  })
})

describe('the choices', () => {
  it('start from the defaults and keep what was set', () => {
    expect(getPrefs()).toEqual(DEFAULT_PREFS)
    setPrefs({ ...DEFAULT_PREFS, sound: true, tasks: false })
    expect(getPrefs()).toMatchObject({ sound: true, tasks: false, desktop: true })
  })

  it('ignore what is not a yes or a no', () => {
    store.set(PREFS_KEY, JSON.stringify({ desktop: 'yes', sound: true }))
    expect(getPrefs()).toMatchObject({ desktop: true, sound: true })
    store.set(PREFS_KEY, '{broken')
    expect(getPrefs()).toEqual(DEFAULT_PREFS)
  })
})

describe('the history', () => {
  it('is read back, without the entries that are not notifications', () => {
    store.set(LOG_KEY, JSON.stringify([note('a'), { id: 1 }, note('b', { kind: 'weird' as never }), note('c', { kind: 'error' })]))
    expect(getLog().map((item) => item.id)).toEqual(['a', 'c'])
  })

  it('keeps only the most recent ones', () => {
    saveLog(Array.from({ length: LOG_LIMIT + 10 }, (_, index) => note(`n${index}`)))
    expect(getLog()).toHaveLength(LOG_LIMIT)
    expect(getLog()[0].id).toBe('n0')
  })
})

describe('ago', () => {
  it('says how long ago in a few words', () => {
    const now = 10_000_000
    expect(ago(now - 10_000, now)).toBe('just now')
    expect(ago(now - 5 * 60_000, now)).toBe('5 min ago')
    expect(ago(now - 3 * 3_600_000, now)).toBe('3 h ago')
    expect(ago(now - 2 * 86_400_000, now)).toBe('2 d ago')
  })
})
