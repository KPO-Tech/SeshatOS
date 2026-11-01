// The first screen of a new install lets the person choose how the app looks before anything else. It is shown once: this is what remembers it.

const storageKey = 'seshat.intro'

/**
 * Whether the introduction was already shown. When the storage cannot be read, it counts as shown: a person whose storage is blocked
 * would otherwise meet the same screen at every start.
 */
export function hasSeenIntro(): boolean {
  if (typeof window === 'undefined') return true
  try {
    return window.localStorage.getItem(storageKey) === 'done'
  } catch {
    return true
  }
}

export function markIntroSeen() {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(storageKey, 'done')
  } catch {
    // Not remembered: the next start shows it again.
  }
}
